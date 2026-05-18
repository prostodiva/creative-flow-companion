// src/domain/models/speechRewrite.ts
export function rewriteForSpeech(text: string, tone: "calm"|"sharp"|"urgent"): string {
  // 1. contractions
  let s = text.replace(/\byou are\b/gi, "you're")
             .replace(/\byou have\b/gi, "you've")
             .replace(/\bI am\b/gi, "I'm");

  // 2. add human markers — this is the OpenAI trick
  const fillers = tone === "calm"? ["", "hey,", "so,", "okay,"] : ["", "hey"];
  const prefix = fillers[Math.floor(Math.random() * fillers.length)];

  // 3. break into breath groups
  s = s.replace(/(\.|\?|!)\s+/g, "$1 <break time='300ms'> ");
  s = s.replace(/,/g, ", <break time='120ms'>");

  // 4. soften commands
  s = s.replace(/You should/g, "maybe")
      .replace(/You must/g, "let's try to");

  return `${prefix} ${s}`.trim().slice(0, 180);
}