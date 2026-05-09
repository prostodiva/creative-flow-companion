// src/core/memoryWriter.ts
import { ChromaClient, type Collection } from "chromadb";
import { config } from "./config.js";
import { logger } from "./logger.js";

const COLLECTION = "coach_sessions";
const CHUNK_SIZE = 500;

let _collection: Collection | null = null;

async function getCollection(): Promise<Collection> {
  if (_collection) return _collection;

  // FIX 1: host/port instead of path
  const client = new ChromaClient({
    host: "localhost",
    port: 8000,
    ssl: false,
  });

  // FIX 2: Disable default embedding
  _collection = await client.getOrCreateCollection({
    name: COLLECTION,
    metadata: { "hnsw:space": "cosine" },
    embeddingFunction: null as any,
  });
  logger.info(
    { count: await _collection.count() },
    "ChromaDB collection ready",
  );
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

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length > CHUNK_SIZE && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export interface SessionDocument {
  id: string;
  text: string;
  metadata: {
    date: string;
    ts: number; // FIX 3: Add numeric timestamp
    appPrimary: string;
    hadCommits: boolean;
    commitCount: number;
    entertainmentMin: number;
    filesTouched: string;
  };
}

export async function writeSession(doc: SessionDocument): Promise<void> {
  let collection: Collection;
  try {
    collection = await getCollection();
  } catch (err) {
    logger.warn(
      { err },
      "[MemoryWriter] ChromaDB unavailable — skipping write",
    );
    return;
  }

  const chunks = chunkText(doc.text);
  logger.info(
    { id: doc.id, chunks: chunks.length },
    "[MemoryWriter] Writing session",
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${doc.id}_${i}`;
    const chunk = chunks[i];
    if (!chunk) continue;

    let vector: number[];

    try {
      vector = await embed(chunk);
    } catch (err) {
      logger.error(
        { err, chunkId },
        "[MemoryWriter] Embed failed — skipping chunk",
      );
      continue;
    }

    await collection.upsert({
      ids: [chunkId],
      embeddings: [vector],
      documents: [chunk],
      metadatas: [{ ...doc.metadata, chunkIndex: i }],
    });

    logger.debug({ chunkId }, "[MemoryWriter] Upserted");
  }
}
