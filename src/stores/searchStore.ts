/**
 * searchStore.ts — Zustand store for search UI state and indexing progress.
 *
 * This store is NOT persisted — it is session-only.
 * Cleared on vault lock via clearViewer() in viewerStore.ts.
 */

import { create } from 'zustand'

export type IndexingStatus = 'idle' | 'building' | 'ready' | 'error'
export type EmbeddingStatus = 'idle' | 'loading-model' | 'indexing' | 'ready' | 'error'

interface SearchState {
  /** Whether the search panel is open. */
  isSearchOpen: boolean

  /** Full-text index build status. */
  fulltextStatus: IndexingStatus

  /** Semantic embedding generation status. */
  embeddingStatus: EmbeddingStatus

  /** Progress for embedding generation: how many messages have been embedded. */
  embeddingDone: number

  /** Total messages needing embedding. */
  embeddingTotal: number

  /** Model download progress (0-100). */
  modelProgress: number

  /** Open the search panel. */
  openSearch: () => void

  /** Close the search panel. */
  closeSearch: () => void

  /** Update full-text index status. */
  setFulltextStatus: (status: IndexingStatus) => void

  /** Update embedding status and progress. */
  setEmbeddingProgress: (status: EmbeddingStatus, done?: number, total?: number) => void

  /** Update model download progress. */
  setModelProgress: (progress: number) => void

  /** Reset all search state on vault lock. */
  clearSearch: () => void
}

export const useSearchStore = create<SearchState>()((set) => ({
  isSearchOpen: false,
  fulltextStatus: 'idle',
  embeddingStatus: 'idle',
  embeddingDone: 0,
  embeddingTotal: 0,
  modelProgress: 0,

  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),

  setFulltextStatus: (status) => set({ fulltextStatus: status }),

  setEmbeddingProgress: (status, done, total) =>
    set({
      embeddingStatus: status,
      ...(done !== undefined ? { embeddingDone: done } : {}),
      ...(total !== undefined ? { embeddingTotal: total } : {}),
    }),

  setModelProgress: (progress) => set({ modelProgress: progress }),

  clearSearch: () =>
    set({
      isSearchOpen: false,
      fulltextStatus: 'idle',
      embeddingStatus: 'idle',
      embeddingDone: 0,
      embeddingTotal: 0,
      modelProgress: 0,
    }),
}))

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.state = useSearchStore.getState()
  })
  if (import.meta.hot.data?.state) {
    useSearchStore.setState(import.meta.hot.data.state)
  }
}
