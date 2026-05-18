

import { spawn, execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

const PIPER = `${process.env.HOME}/.local/bin/piper`;
const MODEL = `${process.env.HOME}/.piper/en_US-amy-medium.onnx`;

export async function speakWithPiper(text: string): Promise<void> {
  const human = text
  .replace(/\byou are\b/gi, "you're")
  .replace(/\byou have\b/gi, "you've")
  .replace(/\bYou should\b/g, "maybe")
  .replace(/\bYou must\b/g, "try to");

  const out = `/tmp/flow-${Date.now()}.wav`;

  // 1. Run piper, pipe text via stdin
  await new Promise<void>((resolve, reject) => {
    const piper = spawn(PIPER, [
      "--model", MODEL,
      "--output_file", out
    ]);

    let err = "";
    piper.stderr.on("data", d => err += d.toString());
    piper.on("close", code => code === 0? resolve() : reject(new Error(err)));

    piper.stdin.write(human);
    piper.stdin.end();
  });

  // 2. Play it
  await execFileAsync("afplay", [out]).catch(() => {});
}