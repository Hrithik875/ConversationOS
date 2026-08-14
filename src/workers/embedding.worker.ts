/**
 * embedding.worker.ts — Web Worker for Transformers.js embedding generation.
 *
 * Loads the all-MiniLM-L6-v2 model (cached by browser after first download),
 * generates Float32Array embedding vectors for batches of message content,
 * and embeds query strings on demand.
 *
 * After the model is cached locally, no network requests are made during
 * actual embedding computation — the model runs entirely via WASM/WebGPU.
 *
 * SECURITY NOTE: This worker receives plaintext message content transiently.
 * It does NOT persist anything to storage — that is the responsibility of
 * the main thread (which encrypts vectors before writing to Dexie).
 *
 * Protocol (main → worker):
 *   { type: 'embed', batch: EmbeddableMessage[] }
 *   { type: 'embedQuery', text: string, requestId: string }
 *
 * Protocol (worker → main):
 *   { type: 'modelLoading' }
 *   { type: 'modelProgress', file: string, progress: number, loaded: number, total: number }
 *   { type: 'modelReady' }
 *   { type: 'progress', done: number, total: number }
 *   { type: 'result', messageId: number, vector: Float32Array }
 *   { type: 'done' }
 *   { type: 'queryResult', requestId: string, vector: Float32Array }
 *   { type: 'error', message: string }
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbeddableMessage, EmbeddingWorkerRequest } from '../types/search'

// Skip local model checks since we're in a browser worker environment
env.allowLocalModels = false

/** Model identifier — pinned so modelVersion in DB is stable. */
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/** Batch size for embedding generation to balance throughput and UI responsiveness. */
const EMBED_BATCH_SIZE = 16

let pipe: FeatureExtractionPipeline | null = null
let loadModelPromise: Promise<FeatureExtractionPipeline> | null = null

async function loadModel(): Promise<FeatureExtractionPipeline> {
  if (pipe) return pipe
  if (loadModelPromise) return loadModelPromise

  self.postMessage({ type: 'modelLoading' })
  loadModelPromise = pipeline('feature-extraction', MODEL_ID, {
    // Use quantized model to reduce download size (~23MB vs ~90MB).
    // Quantization has negligible quality loss for semantic search at this scale.
    dtype: 'q8',
    progress_callback: (data: {
      status: string
      file: string
      progress?: number
      loaded?: number
      total?: number
    }) => {
      if (data.status === 'progress' || data.status === 'downloading') {
        self.postMessage({
          type: 'modelProgress',
          file: data.file,
          progress: data.progress ?? 0,
          loaded: data.loaded ?? 0,
          total: data.total ?? 0,
        })
      }
    },
  }).then((p) => {
    pipe = p
    self.postMessage({ type: 'modelReady' })
    return p
  })

  return loadModelPromise
}

let isProcessing = false
const processingQueue: (() => void)[] = []

async function acquireLock(): Promise<void> {
  if (!isProcessing) {
    isProcessing = true
    return
  }
  return new Promise((resolve) => {
    processingQueue.push(resolve)
  })
}

function releaseLock(): void {
  if (processingQueue.length > 0) {
    const next = processingQueue.shift()
    next?.()
  } else {
    isProcessing = false
  }
}

async function embedText(
  extractor: FeatureExtractionPipeline,
  text: string,
): Promise<Float32Array> {
  await acquireLock()
  try {
    // The pipeline returns a Tensor with shape [1, seqLen, dim].
    const output = await extractor(text, { pooling: 'mean', normalize: true })

    // Safely copy the data into a new Float32Array to avoid transferring the ONNX runtime's internal buffer
    const data = output.data
    const vec = new Float32Array(data.length)
    vec.set(data as ArrayLike<number>)
    return vec
  } finally {
    releaseLock()
  }
}

async function processBatch(messages: EmbeddableMessage[]): Promise<void> {
  const extractor = await loadModel()
  const total = messages.length

  for (let i = 0; i < total; i += EMBED_BATCH_SIZE) {
    const batch = messages.slice(i, i + EMBED_BATCH_SIZE)

    for (const msg of batch) {
      try {
        const vector = await embedText(extractor, msg.content)
        // Transfer the buffer to avoid copying — main thread takes ownership.
        self.postMessage(
          { type: 'result', messageId: msg.messageId, vector },
          { transfer: [vector.buffer] },
        )
      } catch (err) {
        // Log but don't abort the entire batch for one message.
        console.error(`[embedding.worker] Failed to embed message ${msg.messageId}:`, err)
      }
    }

    self.postMessage({ type: 'progress', done: Math.min(i + EMBED_BATCH_SIZE, total), total })
  }

  self.postMessage({ type: 'done' })
}

self.onmessage = async (e: MessageEvent<EmbeddingWorkerRequest>) => {
  const msg = e.data

  if (msg.type === 'embed') {
    try {
      await processBatch(msg.batch)
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }

  if (msg.type === 'embedQuery') {
    try {
      const extractor = await loadModel()
      const vector = await embedText(extractor, msg.text)
      self.postMessage(
        { type: 'queryResult', requestId: msg.requestId, vector },
        { transfer: [vector.buffer] },
      )
    } catch (err) {
      self.postMessage({ type: 'queryError', requestId: msg.requestId, message: String(err) })
    }
    return
  }
}
