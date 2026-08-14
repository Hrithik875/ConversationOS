/**
 * viewerStore.ts — Zustand store for chat viewer state.
 *
 * Manages which chat is active, and clears viewer state on vault lock.
 * This store is NOT persisted — it's session-only.
 */

import { create } from 'zustand'
import { clearDecryptionCache } from '@/lib/viewer/decryptionCache'
import { clearMediaCache } from '@/lib/viewer/mediaCache'
import { clearFulltextIndex } from '@/lib/search/fulltextIndex'
import { clearSemanticIndex } from '@/lib/search/semanticIndex'
import { useSearchStore } from '@/stores/searchStore'

interface ViewerState {
  /** Currently active chat ID, or null if no chat is selected. */
  activeChatId: number | null

  /** Select a chat to view. */
  selectChat: (chatId: number) => void

  /** Deselect the current chat (go back to list). */
  deselectChat: () => void

  /**
   * Clear all viewer and search state. Called when the vault locks.
   * Clears:
   *   - Phase 3: decryption cache and media cache
   *   - Phase 4: in-memory fulltext index and decrypted embedding vectors
   *
   * SECURITY NOTE: Encrypted embedding vectors remain in Dexie (they are
   * encrypted at rest). Only the in-memory plaintext forms are cleared here.
   */
  clearViewer: () => void
}

export const useViewerStore = create<ViewerState>()((set) => ({
  activeChatId: null,

  selectChat: (chatId: number) => set({ activeChatId: chatId }),

  deselectChat: () => set({ activeChatId: null }),

  clearViewer: () => {
    // Phase 3 caches
    clearDecryptionCache()
    clearMediaCache()
    // Phase 4 in-memory indexes (workers terminated, vectors wiped)
    clearFulltextIndex()
    clearSemanticIndex()
    // Search UI state
    useSearchStore.getState().clearSearch()
    set({ activeChatId: null })
  },
}))

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.state = useViewerStore.getState()
  })
  if (import.meta.hot.data?.state) {
    useViewerStore.setState(import.meta.hot.data.state)
  }
}
