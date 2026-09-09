import { cn } from "@/lib/utils";
import type { AvatarState } from "@/lib/ravi/types";

const RING_COLOR: Record<AvatarState, string> = {
  IDLE: "var(--violet)",
  CONNECTING: "var(--cyan)",
  LISTENING: "var(--cyan)",
  THINKING: "var(--primary)",
  SPEAKING: "var(--violet)",
  ERROR: "var(--destructive)",
};

/**
 * The always-present presence layer. It sits behind the avatar video so the
 * assistant never looks "dead" while connecting, thinking, or on fallback.
 */
export function AvatarOrb({
  state,
  children,
}: {
  state: AvatarState;
  children?: React.ReactNode;
}) {
  const color = RING_COLOR[state];
  const animated = state !== "IDLE" && state !== "ERROR";

  return (
    <div className="relative flex aspect-square w-full max-w-[440px] items-center justify-center">
      {animated && (
        <>
          <span
            aria-hidden
            className="absolute inset-6 rounded-full"
            style={{
              border: `2px solid ${color}`,
              animation: "ravi-pulse-ring 2.6s ease-out infinite",
            }}
          />
          <span
            aria-hidden
            className="absolute inset-6 rounded-full"
            style={{
              border: `2px solid ${color}`,
              animation: "ravi-pulse-ring 2.6s ease-out 1.3s infinite",
            }}
          />
        </>
      )}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${color}, transparent 68%)`,
          animation: animated ? "ravi-breathe 3.4s ease-in-out infinite" : undefined,
          opacity: animated ? undefined : 0.28,
        }}
      />
      <div
        className={cn(
          "relative z-10 flex aspect-square w-[86%] items-center justify-center overflow-hidden rounded-full",
          "glass-panel shadow-2xl",
        )}
        style={{ borderColor: color }}
      >
        {children}
      </div>
    </div>
  );
}

export function SpeakingBars({ active }: { active: boolean }) {
  return (
    <div className="flex h-6 items-end gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className="w-1 rounded-full"
          style={{
            height: "100%",
            backgroundColor: "var(--violet)",
            transformOrigin: "bottom",
            animation: active
              ? `ravi-bar 0.9s ease-in-out ${index * 0.12}s infinite`
              : undefined,
            transform: active ? undefined : "scaleY(0.3)",
          }}
        />
      ))}
    </div>
  );
}