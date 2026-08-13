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
 *   { type: 'modelReady' }
 *   { type: 'progress', done: number, total: number }
 *   { type: 'result', messageId: number, vector: Float32Array }
 *   { type: 'done' }
 *   { type: 'queryResult', requestId: string, vector: Float32Array }
 *   { type: 'error', message: string }
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import type { EmbeddableMessage, EmbeddingWorkerRequest } from '../types/search'

/** Model identifier — pinned so modelVersion in DB is stable. */
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/** Batch size for embedding generation to balance throughput and UI responsiveness. */
const EMBED_BATCH_SIZE = 16

let pipe: FeatureExtractionPipeline | null = null

async function loadModel(): Promise<FeatureExtractionPipeline> {
  if (pipe) return pipe
  self.postMessage({ type: 'modelLoading' })
  pipe = await pipeline('feature-extraction', MODEL_ID, {
    // Use quantized model to reduce download size (~23MB vs ~90MB).
    // Quantization has negligible quality loss for semantic search at this scale.
    dtype: 'q8',
  })
  self.postMessage({ type: 'modelReady' })
  return pipe
}

async function embedText(
  extractor: FeatureExtractionPipeline,
  text: string,
): Promise<Float32Array> {
  // The pipeline returns a Tensor with shape [1, seqLen, dim].
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  // output.data is a Float32Array of length dim (already pooled + normalized by HF transformers).
  return new Float32Array(output.data as Float32Array)
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
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }
}
