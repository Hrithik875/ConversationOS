import { useState, useId, useRef } from 'react'
import { useVaultStore } from '@/stores/vaultStore'

/**
 * Rate-limiting configuration.
 *
 * After MAX_ATTEMPTS_BEFORE_DELAY consecutive failures, the UI enforces
 * an increasing cooldown before the next attempt is accepted.
 *
 * UX-level deterrent only — documented limitation:
 * This soft rate-limit does NOT protect against an offline brute-force
 * attack on stolen vaultMeta data. An attacker who copies the local
 * IndexedDB can simply bypass this UI entirely.
 *
 * The REAL defense against brute-force is Argon2id's cost parameters
 * (64 MB memory, 3 iterations), which make each guess expensive in both
 * time and memory regardless of the UI. See DOCUMENTATION.md Phase 1 entry.
 */
const MAX_ATTEMPTS_BEFORE_DELAY = 5
/** Base delay in ms. Doubles with each attempt beyond the threshold. */
const BASE_DELAY_MS = 2000
/** Maximum delay cap (30 seconds). */
const MAX_DELAY_MS = 30_000

/**
 * Compute the delay in milliseconds for a given failed attempt count.
 * Returns 0 if attempts <= threshold (no delay yet).
 */
function computeDelay(attempts: number): number {
  if (attempts <= MAX_ATTEMPTS_BEFORE_DELAY) return 0
  const extra = attempts - MAX_ATTEMPTS_BEFORE_DELAY
  return Math.min(BASE_DELAY_MS * Math.pow(2, extra - 1), MAX_DELAY_MS)
}

/**
 * VaultLockScreen — Shown when vaultStore.status === 'locked'.
 *
 * The user enters their passphrase to unlock the vault. If the passphrase is
 * correct, the vault store transitions to 'unlocked'. If incorrect, a generic
 * error is shown (no detail about why it failed — no information leakage).
 *
 * Rate-limiting: after 5 consecutive failures, increasing cooldown delays
 * are enforced before the next attempt can be submitted.
 */
export function VaultLockScreen() {
  const unlock = useVaultStore((s) => s.unlock)
  const isLoading = useVaultStore((s) => s.isLoading)
  const failedAttempts = useVaultStore((s) => s.failedAttempts)
  const clearError = useVaultStore((s) => s.clearError)

  const [passphrase, setPassphrase] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const passphraseId = useId()

  /** Start the cooldown timer after a rate-limited attempt. */
  function startCooldown(delayMs: number) {
    const endTime = Date.now() + delayMs
    setCooldownRemaining(Math.ceil(delayMs / 1000))

    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / 1000)
      if (remaining <= 0) {
        setCooldownRemaining(0)
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current)
          cooldownTimerRef.current = null
        }
      } else {
        setCooldownRemaining(remaining)
      }
    }, 200)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!passphrase.trim()) {
      setLocalError('Please enter your passphrase.')
      return
    }

    // Check if still in cooldown from a previous failed attempt.
    if (cooldownRemaining > 0) return

    // Pre-compute delay based on CURRENT failed attempt count before this attempt.
    // We compute it here so the delay applies immediately after this (potentially failing) attempt.
    const nextAttemptDelay = computeDelay(failedAttempts + 1)

    try {
      await unlock(passphrase)
      // If unlock succeeded, the store transitions to 'unlocked' and this
      // component will be unmounted by the router. Clear password either way.
      setPassphrase('')
    } catch {
      // Unexpected error — store's lastError is already set.
    }

    // After the attempt, check if we need to start a cooldown.
    // We read updated state via store selector after the await.
    if (nextAttemptDelay > 0) {
      startCooldown(nextAttemptDelay)
    }
  }

  const isBlocked = cooldownRemaining > 0
  const canSubmit = !isLoading && !isBlocked && passphrase.length > 0

  // Get error from store (set by vaultStore.unlock on failure)
  const storeError = useVaultStore.getState().lastError

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <svg
              className="h-7 w-7 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vault locked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your passphrase to unlock ConversationOS.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={passphraseId} className="block text-sm font-medium text-foreground">
              Passphrase
            </label>
            <div className="relative">
              <input
                id={passphraseId}
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setLocalError(null)
                  clearError()
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                placeholder="Enter your passphrase"
                disabled={isLoading || isBlocked}
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Errors — generic only, no information leakage */}
          {(localError ?? storeError) && !isBlocked && (
            <p className="text-sm text-destructive">{localError ?? storeError}</p>
          )}

          {/* Rate-limit cooldown notice */}
          {isBlocked && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">Too many failed attempts.</p>
              <p className="text-muted-foreground">
                Please wait <strong>{cooldownRemaining}s</strong> before trying again.
              </p>
            </div>
          )}

          {/* Failed attempts indicator */}
          {failedAttempts > 0 && !isBlocked && (
            <p className="text-xs text-muted-foreground">
              {failedAttempts} failed attempt{failedAttempts !== 1 ? 's' : ''} this session.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? 'Unlocking…' : isBlocked ? `Wait ${cooldownRemaining}s` : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
