import { useEffect } from 'react'
import { ThemeProvider } from '@/app/theme-provider'
import { AutoLockProvider, ensureAutoLockSetting } from '@/app/AutoLockProvider'
import { useVaultStore } from '@/stores/vaultStore'
import { VaultCreationScreen } from '@/modules/vault/VaultCreationScreen'
import { VaultLockScreen } from '@/modules/vault/VaultLockScreen'
import { VaultTestHarness } from '@/modules/vault/VaultTestHarness'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * VaultRouter — renders the correct screen based on vault status.
 *
 * 'no-vault'  → VaultCreationScreen (first-run flow)
 * 'locked'    → VaultLockScreen
 * 'unlocked'  → App shell placeholder (Phase 0 stub, replaced in future phases)
 *               + VaultTestHarness (dev only, temporary scaffolding)
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

/** Placeholder app shell shown when vault is unlocked. */
function UnlockedAppShell() {
  const lock = useVaultStore((s) => s.lock)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 text-center">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={lock}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
        >
          Lock vault
        </button>
        <ThemeToggle />
      </div>
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
        ConversationOS
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Vault unlocked · App shell placeholder (Phase 1)
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Import, viewer, search, and other features will appear here in future phases.
      </p>

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
