// src/core/memoryRetriever.ts
import { ChromaClient, type Collection } from "chromadb";
import { config } from "../../infrastructure/config.js";
import { logger } from "../../infrastructure/logger.js";

const COLLECTION = "coach_sessions";
const TOP_K = 3;
const LOOKBACK_DAYS = 7;

let _collection: Collection | null = null;

async function getCollection(): Promise<Collection> {
  if (_collection) return _collection;

  const client = new ChromaClient({
    host: "localhost",
    port: 8000,
    ssl: false,
  });

  _collection = await client.getOrCreateCollection({
    name: COLLECTION,
    metadata: { "hnsw:space": "cosine" },
    embeddingFunction: null as any, // We embed manually
  });
  return _collection;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${config.OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

function sevenDaysAgoMs(): number {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d.getTime();
}

function formatResult(doc: string, meta: Record<string, unknown>): string {
  const ts = Number(meta.ts ?? 0);
  const date = ts ? new Date(ts).toISOString().slice(0, 10) : "unknown";
  const entMin = Number(meta.entertainmentMin ?? 0);
  const hadCommits = Boolean(meta.hadCommits);
  const commitCount = Number(meta.commitCount ?? 0);
  const files = String(meta.filesTouched ?? "")
    .split("|")
    .filter(Boolean);

  const parts: string[] = [date + ":"];
  if (entMin > 0) parts.push(`${entMin}min video/entertainment`);
  if (files.length > 0) parts.push(`opened ${files.join(", ")}`);
  if (!hadCommits) parts.push("0 commits");
  else parts.push(`${commitCount} commit(s)`);

  const excerpt = doc.length > 100 ? doc.slice(0, 100) + "…" : doc;
  parts.push(`— "${excerpt}"`);

  return parts.join(", ");
}

export type RetrieveInput = {
  activeApp: string;
  recentFiles: string[];
  commitCount: number;
  entertainmentVideoMs: number; 
};

export async function retrieveMemory(input: RetrieveInput): Promise<string[]> {
  const entMin = Math.floor((input.entertainmentVideoMs ?? 0) / 60_000);
  const files = input.recentFiles.join(", ") || "none";
  const queryText =
    `User behavior: ${input.activeApp} active, ` +
    `${entMin}min entertainment, ` +
    `${input.commitCount ?? 0} commits, ` +
    `files: ${files}`;

  logger.debug({ queryText }, "[MemoryRetriever] Query");

  let collection: Collection;
  try {
    collection = await getCollection();
  } catch (err) {
    logger.warn(
      { err },
      "[MemoryRetriever] ChromaDB unavailable — returning empty history",
    );
    return [];
  }

  let vector: number[];
  try {
    vector = await embed(queryText);
  } catch (err) {
    logger.warn(
      { err },
      "[MemoryRetriever] Embed failed — returning empty history",
    );
    return [];
  }

  const results = await collection.query({
    queryEmbeddings: [vector],
    nResults: TOP_K,
    where: { ts: { $gte: sevenDaysAgoMs() } }, 
    include: ["documents", "metadatas", "distances"] as any,
  });

  const docs = results.documents?.[0] ?? [];
  const metas = results.metadatas?.[0] ?? [];

  return docs.map((doc, i) => formatResult(doc!, metas[i] ?? {}));
}
