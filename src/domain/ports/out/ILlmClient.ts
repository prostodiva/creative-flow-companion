export interface ILlmClient {
  invoke(prompt: string): Promise<string>;
}
