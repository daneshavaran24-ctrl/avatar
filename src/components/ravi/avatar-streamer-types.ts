export interface AvatarStreamerHandle {
  speak: (text: string) => Promise<void>;
  interrupt: () => Promise<void>;
  startListening: () => void;
  stopListening: () => void;
}

export type ConnectionQualityLevel = "GOOD" | "BAD" | "UNKNOWN";

export interface AvatarCredentials {
  token: string;
  avatarId: string | null;
  voiceId: string | null;
  avatarName?: string | null;
  voiceName?: string | null;
  vendor?: "heygen" | "liveavatar";
}
