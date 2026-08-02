import { useState, useId } from 'react'
import zxcvbn from 'zxcvbn'
import { useVaultStore } from '@/stores/vaultStore'

/** Minimum zxcvbn score (0-4) required to create a vault. Score 3 = "strong". */
const MIN_STRENGTH_SCORE = 3

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
const STRENGTH_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-green-500',
  'bg-emerald-500',
]

/**
 * VaultCreationScreen — First-run vault setup flow.
 *
 * Shown when vaultStore.status === 'no-vault'.
 *
 * The screen:
 * 1. Clearly warns the user that this passphrase cannot be recovered.
 * 2. Requires explicit checkbox confirmation before proceeding.
 * 3. Shows a live zxcvbn strength meter, rejecting weak passphrases.
 * 4. Requires passphrase confirmation to match.
 * 5. On submit: calls vaultStore.createVault(passphrase).
 *
 * The passphrase is NEVER stored or logged — only passed to createVault(),
 * which derives the key and immediately discards the plaintext.
 */
export function VaultCreationScreen() {
  const createVault = useVaultStore((s) => s.createVault)
  const isLoading = useVaultStore((s) => s.isLoading)
  const lastError = useVaultStore((s) => s.lastError)

  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const passphraseId = useId()
  const confirmId = useId()
  const checkboxId = useId()

  const strength = passphrase.length > 0 ? zxcvbn(passphrase) : null
  const score = strength?.score ?? 0
  const isStrongEnough = score >= MIN_STRENGTH_SCORE
  const confirmMatches = confirm === passphrase && confirm.length > 0

  const canSubmit = understood && isStrongEnough && confirmMatches && !isLoading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!confirmMatches) {
      setSubmitError('Passphrases do not match.')
      return
    }
    if (!isStrongEnough) {
      setSubmitError('Passphrase is not strong enough.')
      return
    }

    try {
      await createVault(passphrase)
    } catch {
      // Error is already set in the store via lastError.
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your vault</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ConversationOS encrypts all your data locally with your passphrase.
          </p>
        </div>

        {/* Warning box */}
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive">⚠ No recovery possible</p>
          <p className="mt-1 text-muted-foreground">
            Your passphrase is the only way to unlock your data. It is never sent anywhere, never
            stored, and{' '}
            <strong className="text-foreground">cannot be recovered if forgotten</strong>. If you
            lose it, your data is permanently inaccessible. There is no reset, no backup passphrase,
            and no support team that can help.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Passphrase input */}
          <div className="space-y-1.5">
            <label htmlFor={passphraseId} className="block text-sm font-medium text-foreground">
              Passphrase
            </label>
            <div className="relative">
              <input
                id={passphraseId}
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter a strong passphrase"
                disabled={isLoading}
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

            {/* Strength meter */}
            {passphrase.length > 0 && (
              <div className="space-y-1">
                <div className="flex h-1.5 gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                        i <= score ? STRENGTH_COLORS[score] : 'bg-border'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${score >= MIN_STRENGTH_SCORE ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
                  >
                    {STRENGTH_LABELS[score]}
                  </span>
                  {score < MIN_STRENGTH_SCORE && (
                    <span className="text-xs text-muted-foreground">
                      {strength?.feedback?.suggestions?.[0] ??
                        'Use a longer, more complex passphrase.'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Confirm passphrase */}
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="block text-sm font-medium text-foreground">
              Confirm passphrase
            </label>
            <input
              id={confirmId}
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                confirm.length > 0
                  ? confirmMatches
                    ? 'border-green-500'
                    : 'border-destructive'
                  : 'border-border'
              }`}
              placeholder="Re-enter your passphrase"
              disabled={isLoading}
            />
            {confirm.length > 0 && !confirmMatches && (
              <p className="text-xs text-destructive">Passphrases do not match.</p>
            )}
          </div>

          {/* Understanding checkbox */}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id={checkboxId}
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              disabled={isLoading}
            />
            <span className="text-sm text-foreground">
              I understand that this passphrase <strong>cannot be recovered if forgotten</strong>,
              and that all my data will be permanently inaccessible without it.
            </span>
          </label>

          {/* Errors */}
          {(submitError ?? lastError) && (
            <p className="text-sm text-destructive">{submitError ?? lastError}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? 'Creating vault…' : 'Create vault'}
          </button>
        </form>
      </div>
    </div>
  )
}
