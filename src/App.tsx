import { useEffect } from 'react'
import { ThemeProvider } from '@/app/theme-provider'
import { AutoLockProvider, ensureAutoLockSetting } from '@/app/AutoLockProvider'
import { useVaultStore } from '@/stores/vaultStore'
import { useImportStore } from '@/stores/importStore'
import { VaultCreationScreen } from '@/modules/vault/VaultCreationScreen'
import { VaultLockScreen } from '@/modules/vault/VaultLockScreen'
import { VaultTestHarness } from '@/modules/vault/VaultTestHarness'
import { ImportScreen } from '@/modules/import/ImportScreen'
import { ImportProgress } from '@/modules/import/ImportProgress'
import { ImportReport } from '@/modules/import/ImportReport'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * VaultRouter — renders the correct screen based on vault status.
 *
 * 'no-vault'  → VaultCreationScreen (first-run flow)
 * 'locked'    → VaultLockScreen
 * 'unlocked'  → UnlockedAppShell (import flow + dev tools)
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
 * Routes between import states: idle (file picker), importing (progress),
 * complete/error (report).
 */
function UnlockedAppShell() {
  const lock = useVaultStore((s) => s.lock)
  const importStatus = useImportStore((s) => s.status)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground">ConversationOS</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={lock}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Lock vault
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center">
        {importStatus === 'idle' && <ImportScreen />}
        {importStatus === 'importing' && <ImportProgress />}
        {(importStatus === 'complete' || importStatus === 'error') && <ImportReport />}
      </main>

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
