/**
 * importStore.ts — Zustand store for import state management.
 *
 * Manages the lifecycle of a chat import operation:
 * idle → importing (with progress) → complete/error
 *
 * This store does NOT persist — import state is session-only.
 * The actual imported data lives in Dexie (chats, messages, media, imports tables).
 */

import { create } from 'zustand'
import type { ImportStats, ImportPhase, ImportWorkerResponse } from '@/types/import'

export type ImportStatus = 'idle' | 'importing' | 'complete' | 'error'

interface ImportState {
  status: ImportStatus

  /** Current phase of the import pipeline. */
  phase: ImportPhase | null

  /** Progress: current item in the current phase. */
  progressCurrent: number

  /** Progress: total items in the current phase. */
  progressTotal: number

  /** Detail string for the current progress step (e.g. filename). */
  progressDetail: string | null

  /** Error message if status === 'error'. */
  errorMessage: string | null

  /** Import ID in Dexie (set on completion). */
  importId: number | null

  /** Final stats (set on completion). */
  stats: ImportStats | null

  /** Reference to the active worker (for cleanup). */
  worker: Worker | null

  /** Start an import from a zip file. */
  startImport: (zipFile: File, vaultKey: CryptoKey) => void

  /** Handle a message from the import worker. */
  handleWorkerMessage: (msg: ImportWorkerResponse) => void

  /** Reset the store to idle state. */
  reset: () => void
}

export const useImportStore = create<ImportState>()((set, get) => ({
  status: 'idle',
  phase: null,
  progressCurrent: 0,
  progressTotal: 0,
  progressDetail: null,
  errorMessage: null,
  importId: null,
  stats: null,
  worker: null,

  startImport: (zipFile: File, vaultKey: CryptoKey) => {
    // Clean up any existing worker.
    const existing = get().worker
    if (existing) existing.terminate()

    set({
      status: 'importing',
      phase: 'extracting',
      progressCurrent: 0,
      progressTotal: 0,
      progressDetail: null,
      errorMessage: null,
      importId: null,
      stats: null,
    })

    // Create the Web Worker using Vite's worker import syntax.
    const worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    })

    set({ worker })

    worker.onmessage = (e: MessageEvent<ImportWorkerResponse>) => {
      get().handleWorkerMessage(e.data)
    }

    worker.onerror = (e: ErrorEvent) => {
      set({
        status: 'error',
        errorMessage: `Worker error: ${e.message}`,
        worker: null,
      })
    }

    // Transfer the CryptoKey to the worker, then send the zip data.
    worker.postMessage({ type: 'setKey', key: vaultKey })

    // Read the file and send the buffer to the worker.
    zipFile.arrayBuffer().then((buffer) => {
      worker.postMessage(
        { type: 'start', zipBuffer: buffer, sourceFileName: zipFile.name },
        [buffer], // Transfer the buffer to avoid copying.
      )
    })
  },

  handleWorkerMessage: (msg: ImportWorkerResponse) => {
    switch (msg.type) {
      case 'progress':
        set({
          phase: msg.phase,
          progressCurrent: msg.current,
          progressTotal: msg.total,
          progressDetail: msg.detail ?? null,
        })
        break

      case 'complete':
        set({
          status: 'complete',
          importId: msg.importId,
          stats: msg.stats,
          phase: null,
          worker: null,
        })
        // Terminate the worker — it's done.
        get().worker?.terminate()
        break

      case 'error':
        set({
          status: 'error',
          errorMessage: msg.message,
          phase: null,
          worker: null,
        })
        get().worker?.terminate()
        break

      case 'needKey':
        set({
          status: 'error',
          errorMessage: 'Vault key not available. Please unlock the vault and try again.',
          phase: null,
        })
        break
    }
  },

  reset: () => {
    const existing = get().worker
    if (existing) existing.terminate()
    set({
      status: 'idle',
      phase: null,
      progressCurrent: 0,
      progressTotal: 0,
      progressDetail: null,
      errorMessage: null,
      importId: null,
      stats: null,
      worker: null,
    })
  },
}))
