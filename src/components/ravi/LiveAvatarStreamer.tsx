import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { AvatarStreamerHandle } from "./avatar-streamer-types";
import { loadLiveAvatarSdk } from "./liveavatar-loader";
import { useChromaKey } from "./useChromaKey";


interface Props {
  token: string;
  onReady: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  onError: (message: string) => void;
}

type AnySession = {
  attach: (el: HTMLVideoElement) => void;
  repeat: (text: string) => void;
  interrupt: () => void;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
};

/**
 * A LiveAvatar session token is single-use: starting it twice kills the live
 * session ("This session has already been started"). React remounts the effect
 * in development, so sessions are kept in a token-keyed, ref-counted registry
 * and reused instead of recreated. The registry hangs off globalThis so a
 * duplicated module instance still shares it.
 */
type SessionEntry = { session: AnySession; refs: number };
const globalScope = globalThis as typeof globalThis & {
  __raviLiveAvatarSessions?: Map<string, SessionEntry>;
};
const sessionRegistry: Map<string, SessionEntry> = (globalScope.__raviLiveAvatarSessions ??=
  new Map<string, SessionEntry>());

/** Browser-only LiveAvatar (app.liveavatar.com) realtime session. */
const LiveAvatarStreamer = forwardRef<AvatarStreamerHandle, Props>(function LiveAvatarStreamer(
  { token, onReady, onSpeakingChange, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<AnySession | null>(null);
  const [connected, setConnected] = useState(false);
  // Resolves when the avatar finishes the current sentence, so consecutive
  // chunks are spoken (and revealed) in step with the mouth instead of being
  // fired off all at once.
  const pendingSpeakRef = useRef<(() => void) | null>(null);
  const chromaRef = useChromaKey(videoRef, connected);

  useImperativeHandle(ref, () => ({
    async speak(text: string) {
      const session = sessionRef.current;
      if (!session) return;
      pendingSpeakRef.current?.();
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(guard);
          if (pendingSpeakRef.current === finish) pendingSpeakRef.current = null;
          resolve();
        };
        // Safety net: never stall the conversation if the end event is missed.
        const guard = window.setTimeout(finish, 4000 + text.length * 120);
        pendingSpeakRef.current = finish;
        session.repeat(text);
      });
    },
    async interrupt() {
      try {
        pendingSpeakRef.current?.();
        sessionRef.current?.interrupt();
      } catch {
        /* interrupting an idle avatar is not an error */
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    void (async () => {
      let mod: typeof import("@heygen/liveavatar-web-sdk");
      try {
        // Loaded here (not at module scope) with an automatic vendor-build
        // fallback, so a bundling failure never kills the live session.
        mod = await loadLiveAvatarSdk();
      } catch (error) {
        if (!cancelled) {
          console.error("[LiveAvatar] SDK failed to load:", {
            error: error instanceof Error ? error.message : String(error),
            hasToken: !!token,
          });
          onError("AVATAR_SDK_LOAD_FAILED");
        }
        return;
      }
      if (cancelled) return;
      const { AgentEventsEnum, LiveAvatarSession, SessionEvent } = mod;


      let entry = sessionRegistry.get(token);
      const isNew = !entry;
      if (!entry) {
        entry = {
          session: new LiveAvatarSession(token, { voiceChat: false }) as unknown as AnySession,
          refs: 0,
        };
        sessionRegistry.set(token, entry);
      }
      entry.refs += 1;
      const session = entry.session;
      sessionRef.current = session;

      const handleReady = () => {
        if (videoRef.current) session.attach(videoRef.current);
        if (!cancelled) {
          setConnected(true);
          onReady();
        }
      };
      const handleDisconnected = () => setConnected(false);
      const handleSpeakStart = () => onSpeakingChange(true);
      const handleSpeakEnd = () => {
        onSpeakingChange(false);
        pendingSpeakRef.current?.();
      };

      session.on(SessionEvent.SESSION_STREAM_READY, handleReady);
      session.on(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleSpeakStart);
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleSpeakEnd);

      if (isNew) {
        session.start().catch((error: unknown) => {
          sessionRegistry.delete(token);
          if (!cancelled) {
            const errorMessage = error instanceof Error ? error.message : "AVATAR_START_FAILED";
            console.error("[LiveAvatar] Session start failed:", {
              error: errorMessage,
              hasToken: !!token,
              isNew,
            });
            onError(errorMessage);
          }
        });
      } else if (videoRef.current) {
        // Remount onto an already-running session.
        session.attach(videoRef.current);
        setConnected(true);
        onReady();
      }

      detach = () => {
        session.off(SessionEvent.SESSION_STREAM_READY, handleReady);
        session.off(SessionEvent.SESSION_DISCONNECTED, handleDisconnected);
        session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleSpeakStart);
        session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, handleSpeakEnd);
        const current = sessionRegistry.get(token);
        if (current) current.refs -= 1;
        sessionRef.current = null;
        // Give an immediate remount a chance to reclaim the session before teardown.
        window.setTimeout(() => {
          const latest = sessionRegistry.get(token);
          if (latest && latest.refs <= 0) {
            sessionRegistry.delete(token);
            void latest.session.stop().catch(() => undefined);
          }
        }, 1000);
      };
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [token]);

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

export default LiveAvatarStreamer;
