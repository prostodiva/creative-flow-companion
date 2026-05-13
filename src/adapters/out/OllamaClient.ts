import { Ollama } from "@langchain/ollama";
import { ILlmClient } from "../../domain/ports/out/ILlmClient.js";
import { config } from "../../infrastructure/config.js"

export class OllamaClient implements ILlmClient {
  private llm: Ollama;

  constructor() {
    this.llm = new Ollama({
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
      temperature: 0.9,
    });
  }

  async invoke(prompt: string): Promise<string> {
    return this.llm.invoke(prompt);
  }
}