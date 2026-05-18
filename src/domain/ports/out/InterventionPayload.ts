

export interface EmotionalMetadata {
  tone?: "calm" | "sharp" | "urgent";
}

export const VOICES = {
  calm: "Samantha",
  sharp: "Tom",
  urgent: "Ava",
} as const;