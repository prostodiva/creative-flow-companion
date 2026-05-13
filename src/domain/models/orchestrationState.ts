/**
 * used by orchestrator.ts
 * creates a typed shared state object schema using an annotation system for LangGraph
 * to track active coding, distraction, inactivity
 * 
 * StateAnnotation - passed to LangGraph
 * TState is used to type every node function — what goes in, what comes out
 * passed the full state, returns only what it changed
 */

import { Annotation } from "@langchain/langgraph";

export const StateAnnotation = Annotation.Root({
  chromeTabCount: Annotation<number>(),
  lastCommitMinutes: Annotation<number>(),
  keystrokesLast5Min: Annotation<number>(),
  activeApp: Annotation<string>(),

  entertainmentVideoMs: Annotation<number>(),
  workVideoMs: Annotation<number>(),

  shouldIntervene: Annotation<boolean>(),
  interventionPrompt: Annotation<string | undefined>(),
  recentFiles: Annotation<string[]>(),
  gitDiffSummary: Annotation<string>(),
  todoList: Annotation<string[]>(),
  retrievedHistory: Annotation<string[]>(),
});

export type TState = typeof StateAnnotation.State;