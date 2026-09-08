import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { AvatarStreamerHandle } from "./avatar-streamer-types";
import { useChromaKey } from "./useChromaKey";

interface Props {
  token: string;
  avatarId: string | null;
  voiceId: string | null;
  onReady: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Browser-only HeyGen streaming avatar. The SDK is imported inside the effect so
 * it never shares a bundle chunk with the LiveAvatar SDK — sharing one chunk made
 * a common CommonJS base class evaluate as `undefined` ("Class extends value
 * undefined") and crashed the whole stage at module load.
 */
const HeygenStreamer = forwardRef<AvatarStreamerHandle, Props>(function HeygenStreamer(
  { token, avatarId, voiceId, onReady, onSpeakingChange, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const avatarRef = useRef<{
    speak: (args: { text: string; taskType: unknown }) => Promise<unknown>;
    interrupt: () => Promise<unknown>;
    stopAvatar: () => Promise<unknown>;
  } | null>(null);
  const taskTypeRef = useRef<unknown>("repeat");
  // Resolves when the avatar stops talking, so sentences are spoken one after
  // another and the on-screen text stays in step with the mouth.
  const pendingSpeakRef = useRef<(() => void) | null>(null);
  const [connected, setConnected] = useState(false);
  const chromaRef = useChromaKey(videoRef, connected);

  useImperativeHandle(ref, () => ({
    async speak(text: string) {
      const avatar = avatarRef.current;
      if (!avatar) return;
      pendingSpeakRef.current?.();
      await avatar.speak({ text, taskType: taskTypeRef.current });
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(guard);
          if (pendingSpeakRef.current === finish) pendingSpeakRef.current = null;
          resolve();
        };
        const guard = window.setTimeout(finish, 4000 + text.length * 120);
        pendingSpeakRef.current = finish;
      });
    },
    async interrupt() {
      try {
        pendingSpeakRef.current?.();
        await avatarRef.current?.interrupt();
      } catch {
        /* interrupting an idle avatar is not an error */
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;

    void (async () => {
      try {
        const mod = await import("@heygen/streaming-avatar");
        if (cancelled) return;
        const StreamingAvatar = mod.default;
        const { AvatarQuality, StreamingEvents, TaskType } = mod;
        taskTypeRef.current = TaskType.REPEAT;

        const avatar = new StreamingAvatar({ token });
        avatarRef.current = avatar as unknown as typeof avatarRef.current;
        stop = () => void avatar.stopAvatar().catch(() => undefined);

        avatar.on(StreamingEvents.STREAM_READY, (event: { detail: MediaStream }) => {
          if (videoRef.current && event.detail) {
            videoRef.current.srcObject = event.detail;
            void videoRef.current.play().catch(() => undefined);
          }
          if (!cancelled) {
            setConnected(true);
            onReady();
          }
        });
        avatar.on(StreamingEvents.AVATAR_START_TALKING, () => onSpeakingChange(true));
        avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
          onSpeakingChange(false);
          pendingSpeakRef.current?.();
        });
        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => setConnected(false));

        await avatar.createStartAvatar({
          // Medium keeps the picture sharp while staying light on the network.
          quality: AvatarQuality.Medium,

          avatarName: avatarId ?? "",
          ...(voiceId ? { voice: { voiceId } } : {}),
          language: "fa",
        });
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : "AVATAR_START_FAILED";
          console.error("[HeyGen] Avatar initialization failed:", {
            error: errorMessage,
            avatarId,
            voiceId,
            hasToken: !!token,
          });
          onError(errorMessage);
        }
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      avatarRef.current = null;
    };
    // credentials are minted once per session
  }, [token, avatarId, voiceId]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-contain opacity-0"
      />
      <canvas
        ref={chromaRef}
        className={`h-full w-full object-contain transition-opacity duration-500 ${
          connected ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
});

export default HeygenStreamer;
