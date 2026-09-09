import type {
  WorkerInitializationRenderOptions,
  WorkerPoolOptions,
} from "@pierre/diffs/react";
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";

// Keep syntax tokenization off the UI thread and reuse one bounded worker pool.
export const poolOptions: WorkerPoolOptions = {
  workerFactory: () => new DiffWorker(),
  poolSize: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)),
};
export const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: { light: "pierre-light", dark: "pierre-dark" },
};
