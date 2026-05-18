import { spawn, execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { logger } from "../../infrastructure/logger.js";
import { EmotionalMetadata } from "../ports/out/InterventionPayload.js";

const execFileAsync = promisify(execFile);
const PIPER = `${process.env.HOME}/.local/bin/piper`;

// 1. VOICES
const VOICES = {
  calm: `${process.env.HOME}/.piper/en_US-lessac-high.onnx`,
  sharp: `${process.env.HOME}/.piper/en_US-ryan-high.onnx`,
  urgent: `${process.env.HOME}/.piper/en_US-lessac-high.onnx`,
} as const;

// 2. REWRITE FOR SPEECH (OpenAI-style)
export function rewriteForSpeech(text: string, tone: "calm"|"sharp"|"urgent" = "calm"): string {
  let s = text
   .replace(/\byou are\b/gi, "you're")
   .replace(/\byou have\b/gi, "you've")
   .replace(/\bYou should\b/g, "maybe")
   .replace(/\bYou must\b/g, "let's try to");

  const prefix = tone === "calm" && Math.random() < 0.3? "hey, " : "";

  // add break tags — this is where OpenAI adds breaths
  s = s.replace(/(\.|\?|!)\s+/g, "$1 <break time='300ms'> ");
  s = s.replace(/,/g, ", <break time='120ms'>");

  return (prefix + s).trim().slice(0, 180);
}

// 3. CONVERT BREAK TAGS TO PIPER PAUSES
function toPiperSSML(text: string): string {
  return text.replace(/<break time='(\d+)ms'>/g, (_, ms) =>
    " ".repeat(Math.max(1, Number(ms) / 100)) // Piper uses spaces as micro-pauses
  );
}

// 4. SPEAK
export async function speak(text: string, meta: EmotionalMetadata): Promise<void> {
  const tone = meta.tone?? "calm";
  const rewritten = rewriteForSpeech(text, tone);
  const forPiper = toPiperSSML(rewritten);
  const out = join(tmpdir(), `flow-${Date.now()}.wav`);

  try {
    await new Promise<void>((resolve, reject) => {
      const piper = spawn(PIPER, [
        "--model", VOICES[tone],
        "--output_file", out,
        "--length_scale", tone === "urgent"? "0.92" : "1.05",
      ]);

      piper.stdin.write(forPiper);
      piper.stdin.end();
      piper.on("close", code => code === 0? resolve() : reject(new Error(`piper ${code}`)));
    });

    execFile("afplay", [out]);
  } catch (err) {
    logger.warn({ err }, "Piper failed, fallback to say");
    execFile("say", ["-v", "Samantha", rewritten]);
  }
}