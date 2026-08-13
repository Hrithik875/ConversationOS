/**
 * viewerStore.ts — Zustand store for chat viewer state.
 *
 * Manages which chat is active, and clears viewer state on vault lock.
 * This store is NOT persisted — it's session-only.
 */

import { create } from 'zustand'
import { clearDecryptionCache } from '@/lib/viewer/decryptionCache'
import { clearMediaCache } from '@/lib/viewer/mediaCache'

interface ViewerState {
  /** Currently active chat ID, or null if no chat is selected. */
  activeChatId: number | null

  /** Select a chat to view. */
  selectChat: (chatId: number) => void

  /** Deselect the current chat (go back to list). */
  deselectChat: () => void

  /**
   * Clear all viewer state. Called when the vault locks.
   * Also clears the decryption and media caches.
   */
  clearViewer: () => void
}

export const useViewerStore = create<ViewerState>()((set) => ({
  activeChatId: null,

  selectChat: (chatId: number) => set({ activeChatId: chatId }),

  deselectChat: () => set({ activeChatId: null }),

  clearViewer: () => {
    clearDecryptionCache()
    clearMediaCache()
    set({ activeChatId: null })
  },
}))
