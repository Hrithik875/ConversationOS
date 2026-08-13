import { useEffect } from 'react'
import { ThemeProvider } from '@/app/theme-provider'
import { AutoLockProvider, ensureAutoLockSetting } from '@/app/AutoLockProvider'
import { useVaultStore } from '@/stores/vaultStore'
import { useImportStore } from '@/stores/importStore'
import { useViewerStore } from '@/stores/viewerStore'
import { VaultCreationScreen } from '@/modules/vault/VaultCreationScreen'
import { VaultLockScreen } from '@/modules/vault/VaultLockScreen'
import { VaultTestHarness } from '@/modules/vault/VaultTestHarness'
import { ImportScreen } from '@/modules/import/ImportScreen'
import { ImportProgress } from '@/modules/import/ImportProgress'
import { ImportReport } from '@/modules/import/ImportReport'
import { ChatSidebar } from '@/modules/viewer/ChatSidebar'
import { ChatViewer } from '@/modules/viewer/ChatViewer'
import { ThemeToggle } from '@/components/theme-toggle'

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
 * Hooks vault lock to clear all caches.
 */
function UnlockedAppShell() {
  const lock = useVaultStore((s) => s.lock)
  const vaultStatus = useVaultStore((s) => s.status)
  const importStatus = useImportStore((s) => s.status)
  const activeChatId = useViewerStore((s) => s.activeChatId)
  const clearViewer = useViewerStore((s) => s.clearViewer)

  // Clear caches when vault locks
  useEffect(() => {
    if (vaultStatus === 'locked') {
      clearViewer()
    }
  }, [vaultStatus, clearViewer])

  const handleLock = () => {
    clearViewer()
    lock()
  }

  const isImporting =
    importStatus === 'importing' || importStatus === 'complete' || importStatus === 'error'

  return (
    <div className="flex h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-bold tracking-tight text-foreground">ConversationOS</h1>
        <div className="flex items-center gap-2">
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
            <ChatViewer />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <ChatViewer />
              <div className="border-t border-border pt-6">
                <ImportScreen />
              </div>
            </div>
          )}
        </main>
      </div>

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
