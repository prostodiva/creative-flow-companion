import { z } from "zod";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const ConfigSchema = z.object({
  OLLAMA_BASE_URL: z
    .string()
    .url()
    .refine(
      (url) => {
        const u = new URL(url);
        return (
          u.hostname === "localhost" ||
          u.hostname === "127.0.0.1" ||
          u.protocol === "https:"
        );
      },
      { message: "OLLAMA_BASE_URL must be localhost or https://" },
    ),
  OLLAMA_MODEL: z.string().default("llama3.1"),
  // INTERVENTION_COOLDOWN_MS: z.number().default(10 * 60 * 1000),
  //testing
  INTERVENTION_COOLDOWN_MS: z.number().default(15 * 1000), 
  TAB_OVERLOAD_THRESHOLD: z.number().default(10),
  COMMIT_IDLE_MINUTES: z.number().default(30),  // 30 minutes no commits
  VIDEO_IDLE_MINUTES: z.number().default(30),
  CHROMA_URL: z.string().url().default("http://localhost:8000"),
  SESSION_WINDOW_MS: z.number().default(30 * 60 * 1000),
  SESSION_CRON_EXPR: z.string().default("0 */30 * * * *"),
  //for debugging - 1 minute, every 60 sec
  // SESSION_WINDOW_MS: z.number().default(60 * 1000),
  // SESSION_CRON_EXPR: z.string().default("*/60 * * * *"),
});

export const config = ConfigSchema.parse({
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  INTERVENTION_COOLDOWN_MS:
    Number(process.env.INTERVENTION_COOLDOWN_MS) || undefined,
  TAB_OVERLOAD_THRESHOLD:
    Number(process.env.TAB_OVERLOAD_THRESHOLD) || undefined,
  COMMIT_IDLE_MINUTES: Number(process.env.COMMIT_IDLE_MINUTES) || undefined,
  VIDEO_IDLE_MINUTES: Number(process.env.VIDEO_IDLE_MINUTES) || undefined,
  CHROMA_URL: process.env.CHROMA_URL ?? "http://localhost:8000",
  SESSION_WINDOW_MS: Number(process.env.SESSION_WINDOW_MS) || undefined,
  SESSION_CRON_EXPR: process.env.SESSION_CRON_EXPR,
});
