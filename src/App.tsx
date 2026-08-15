import { useEffect, useState, useCallback } from 'react'
import { ThemeProvider } from '@/app/theme-provider'
import { AutoLockProvider, ensureAutoLockSetting } from '@/app/AutoLockProvider'
import { useVaultStore } from '@/stores/vaultStore'
import { useImportStore } from '@/stores/importStore'
import { useViewerStore } from '@/stores/viewerStore'
import { useSearchStore } from '@/stores/searchStore'
import { VaultCreationScreen } from '@/modules/vault/VaultCreationScreen'
import { VaultLockScreen } from '@/modules/vault/VaultLockScreen'
import { VaultTestHarness } from '@/modules/vault/VaultTestHarness'
import { ImportScreen } from '@/modules/import/ImportScreen'
import { ImportProgress } from '@/modules/import/ImportProgress'
import { ImportReport } from '@/modules/import/ImportReport'
import { ChatSidebar } from '@/modules/viewer/ChatSidebar'
import { ChatViewer } from '@/modules/viewer/ChatViewer'
import { SearchPanel } from '@/modules/search/SearchPanel'
import { ThemeToggle } from '@/components/theme-toggle'
import { buildFulltextIndex } from '@/lib/search/fulltextIndex'
import { loadEmbeddingSession, generateMissingEmbeddings } from '@/lib/search/semanticIndex'

/**
 * VaultRouter — renders the correct screen based on vault status.
 *
 * 'no-vault'  → VaultCreationScreen (first-run flow)
 * 'locked'    → VaultLockScreen
 * 'unlocked'  → UnlockedAppShell (sidebar + viewer/import)
 */
function VaultRouter() {
  const status = useVaultStore((s) => s.status)
  const initialise = useVaultStore((s) => s.initialise)

  useEffect(() => {
    initialise()
    ensureAutoLockSetting()
  }, [initialise])

  if (status === 'no-vault') {
    return <VaultCreationScreen />
  }

  if (status === 'locked') {
    return <VaultLockScreen />
  }

  // status === 'unlocked'
  return <UnlockedAppShell />
}

/**
 * UnlockedAppShell — the main app surface when vault is unlocked.
 *
 * Layout:
 * - Left: Chat sidebar (always visible on desktop, hidden on mobile when chat open)
 * - Right: Chat viewer OR import flow
 *
 * Phase 4 additions:
 * - Eagerly builds the fulltext search index after unlock.
 * - Loads embedding session (decrypts stored vectors into memory).
 * - Generates embeddings for any un-embedded messages in the background.
 * - Handles search result navigation (selectChat + scrollToMessageId).
 * - Renders SearchPanel overlay and Ctrl+K keyboard shortcut.
 */
function UnlockedAppShell() {
  const lock = useVaultStore((s) => s.lock)
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const vaultStatus = useVaultStore((s) => s.status)
  const importStatus = useImportStore((s) => s.status)
  const activeChatId = useViewerStore((s) => s.activeChatId)
  const selectChat = useViewerStore((s) => s.selectChat)
  const clearViewer = useViewerStore((s) => s.clearViewer)
  const openSearch = useSearchStore((s) => s.openSearch)

  // Track the message ID to scroll to after navigating to a chat from search.
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState<number | null>(null)

  // Clear caches when vault locks
  useEffect(() => {
    if (vaultStatus === 'locked') {
      clearViewer()
    }
  }, [vaultStatus, clearViewer])

  // Phase 4: eagerly build fulltext index and load/generate embeddings after unlock.
  useEffect(() => {
    if (!derivedKey) return

    // Build keyword index in background (fast — typically < 2s).
    buildFulltextIndex(derivedKey).catch((err) =>
      console.error('[App] Fulltext index build failed:', err),
    )

    // Load stored embedding session (decrypt stored vectors into memory).
    loadEmbeddingSession(derivedKey)
      .then(() =>
        // Then generate embeddings for any new messages not yet embedded.
        generateMissingEmbeddings(derivedKey),
      )
      .catch((err) => console.error('[App] Embedding session failed:', err))
  }, [derivedKey])

  // Phase 4: rebuild fulltext index after a new import completes.
  useEffect(() => {
    if (importStatus === 'complete' && derivedKey) {
      buildFulltextIndex(derivedKey).catch((err) =>
        console.error('[App] Post-import index rebuild failed:', err),
      )
      generateMissingEmbeddings(derivedKey).catch((err) =>
        console.error('[App] Post-import embedding generation failed:', err),
      )
    }
  }, [importStatus, derivedKey])

  // Global Ctrl+K / Cmd+K shortcut to open search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openSearch])

  const handleLock = () => {
    clearViewer()
    lock()
  }

  // Handle navigation from search results.
  const handleSearchNavigate = useCallback(
    (chatId: number, messageId: number) => {
      selectChat(chatId)
      // Small delay to let the chat load before scrolling.
      setTimeout(() => setPendingScrollMessageId(messageId), 100)
    },
    [selectChat],
  )

  const handleScrollToComplete = useCallback(() => {
    setPendingScrollMessageId(null)
  }, [])

  const isImporting =
    importStatus === 'importing' || importStatus === 'complete' || importStatus === 'error'

  return (
    <div className="flex h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-bold tracking-tight text-foreground">ConversationOS</h1>
        <div className="flex items-center gap-2">
          {/* Global search button */}
          <button
            id="global-search-button"
            onClick={openSearch}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Search (Ctrl+K)"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded bg-muted/80 px-1 py-0.5 text-[9px] font-medium sm:inline">
              Ctrl K
            </kbd>
          </button>

          <button
            onClick={handleLock}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Lock vault
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — hidden on mobile when a chat is open */}
        <aside
          className={`w-72 shrink-0 border-r border-border ${
            activeChatId !== null ? 'hidden md:block' : ''
          }`}
        >
          <ChatSidebar />
        </aside>

        {/* Main panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          {isImporting ? (
            <div className="flex flex-1 items-center justify-center">
              {importStatus === 'importing' && <ImportProgress />}
              {(importStatus === 'complete' || importStatus === 'error') && <ImportReport />}
            </div>
          ) : activeChatId !== null ? (
            <ChatViewer
              scrollToMessageId={pendingScrollMessageId}
              onScrollToComplete={handleScrollToComplete}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <ChatViewer
                scrollToMessageId={pendingScrollMessageId}
                onScrollToComplete={handleScrollToComplete}
              />
              <div className="border-t border-border pt-6">
                <ImportScreen />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Search panel overlay */}
      <SearchPanel onNavigate={handleSearchNavigate} />

      {/* Round-trip test harness — dev only, temporary */}
      <VaultTestHarness />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AutoLockProvider>
        <VaultRouter />
      </AutoLockProvider>
    </ThemeProvider>
  )
}

export default App
