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
  // INTERVENTION_COOLDOWN_MS: z.coerce.number().default(10 * 60 * 1000),
  INTERVENTION_COOLDOWN_MS: z.coerce.number().default(15 * 1000), //testing 15 sec
  TAB_OVERLOAD_THRESHOLD: z.coerce.number().default(10),
  COMMIT_IDLE_MINUTES: z.coerce.number().default(30),
  VIDEO_IDLE_MINUTES: z.coerce.number().default(30),
  SESSION_WINDOW_MS: z.coerce.number().default(30 * 60 * 1000),
  CHROMA_URL: z.string().url().default("http://localhost:8000"),
  SESSION_CRON_EXPR: z.string().default("0 */30 * * * *"),
});

export const config = ConfigSchema.parse(process.env);
