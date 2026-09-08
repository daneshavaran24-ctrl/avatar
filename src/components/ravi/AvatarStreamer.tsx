import { forwardRef, lazy, Suspense } from "react";

import type { AvatarCredentials, AvatarStreamerHandle } from "./avatar-streamer-types";

export type { AvatarStreamerHandle, AvatarCredentials } from "./avatar-streamer-types";

interface Props {
  credentials: AvatarCredentials;
  onReady: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  onError: (message: string) => void;
}

// Each vendor SDK loads in its own chunk; loading both together made a shared
// CommonJS base class resolve to `undefined` and crash the stage on load.
const HeygenStreamer = lazy(() => import("./HeygenStreamer"));
const LiveAvatarStreamer = lazy(() => import("./LiveAvatarStreamer"));

/** Dispatches to the vendor matching the operator's stored key. */
const AvatarStreamer = forwardRef<AvatarStreamerHandle, Props>(function AvatarStreamer(
  { credentials, onReady, onSpeakingChange, onError },
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
