import { forwardRef, lazy, Suspense } from "react";

import type { AvatarCredentials, AvatarStreamerHandle, ConnectionQualityLevel } from "./avatar-streamer-types";

export type { AvatarStreamerHandle, AvatarCredentials, ConnectionQualityLevel } from "./avatar-streamer-types";

interface Props {
  credentials: AvatarCredentials;
  onReady: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  onError: (message: string) => void;
  onConnectionQualityChange?: (quality: ConnectionQualityLevel) => void;
}

// Each vendor SDK loads in its own chunk; loading both together made a shared
// CommonJS base class resolve to `undefined` and crash the stage on load.
const HeygenStreamer = lazy(() => import("./HeygenStreamer"));
const LiveAvatarStreamer = lazy(() => import("./LiveAvatarStreamer"));

/** Dispatches to the vendor matching the operator's stored key. */
const AvatarStreamer = forwardRef<AvatarStreamerHandle, Props>(function AvatarStreamer(
  { credentials, onReady, onSpeakingChange, onError, onConnectionQualityChange },
  ref,
) {
  return (
    <Suspense fallback={null}>
      {credentials.vendor === "liveavatar" ? (
        <LiveAvatarStreamer
          ref={ref}
          token={credentials.token}
          onReady={onReady}
          onSpeakingChange={onSpeakingChange}
          onError={onError}
          {...(onConnectionQualityChange ? { onConnectionQualityChange } : {})}
        />
      ) : (
        <HeygenStreamer
          ref={ref}
          token={credentials.token}
          avatarId={credentials.avatarId}
          voiceId={credentials.voiceId}
          onReady={onReady}
          onSpeakingChange={onSpeakingChange}
          onError={onError}
        />
      )}
    </Suspense>
  );
});

export default AvatarStreamer;
