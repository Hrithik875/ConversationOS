/**
 * VaultTestHarness.tsx — TEMPORARY DEV SCAFFOLDING
 *
 * PURPOSE: Prove the crypto core works end-to-end across a page reload.
 *
 * This panel is visible only in development builds (import.meta.env.DEV).
 * It encrypts a sample string, stores the ciphertext in the Dexie
 * `_devTestCiphertext` scratch table, and allows you to:
 *   1. Encrypt a sample string → stored in IndexedDB.
 *   2. Reload the page, unlock the vault.
 *   3. Decrypt the stored ciphertext → confirm it matches the original.
 *
 * This exists purely as a verification tool for Phase 1. It does NOT
 * represent any real feature and MUST be removed before v1.0.
 *
 * DO NOT add any real user data handling to this component.
 * DO NOT ship this in production (it is guarded by import.meta.env.DEV).
 */

import { useState } from 'react'
import { useVaultStore } from '@/stores/vaultStore'
import { encrypt, decrypt } from '@/lib/crypto'
import { db } from '@/lib/db'

const SAMPLE_PLAINTEXT = 'ConversationOS round-trip test: Hello, encrypted world! 🔐'

export function VaultTestHarness() {
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const status = useVaultStore((s) => s.status)

  const [encryptStatus, setEncryptStatus] = useState<string | null>(null)
  const [decryptStatus, setDecryptStatus] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  // Only render in development mode.
  if (!import.meta.env.DEV) return null

  if (status !== 'unlocked' || !derivedKey) return null

  async function handleEncrypt() {
    if (!derivedKey) return
    setIsWorking(true)
    setEncryptStatus(null)
    setDecryptStatus(null)
    try {
      const { ciphertext, iv } = await encrypt(SAMPLE_PLAINTEXT, derivedKey)
      // Clear previous test ciphertexts and store the new one.
      await db._devTestCiphertext.clear()
      await db._devTestCiphertext.add({ ciphertext, iv })
      setEncryptStatus(
        `✅ Encrypted and stored in IndexedDB.\nCiphertext (first 40 chars): ${ciphertext.slice(0, 40)}…\nNow reload the page, unlock the vault, then click "Decrypt stored ciphertext".`,
      )
    } catch (err) {
      setEncryptStatus(`❌ Encrypt failed: ${String(err)}`)
    } finally {
      setIsWorking(false)
    }
  }

  async function handleDecrypt() {
    if (!derivedKey) return
    setIsWorking(true)
    setDecryptStatus(null)
    try {
      const stored = await db._devTestCiphertext.toCollection().first()
      if (!stored) {
        setDecryptStatus('❌ No stored ciphertext found. Run "Encrypt sample string" first.')
        return
      }
      const plaintext = await decrypt(stored.ciphertext, stored.iv, derivedKey)
      const match = plaintext === SAMPLE_PLAINTEXT
      setDecryptStatus(
        match
          ? `✅ ROUND-TRIP SUCCESS!\nDecrypted: "${plaintext}"\nMatches original: YES`
          : `❌ ROUND-TRIP FAILURE!\nDecrypted: "${plaintext}"\nExpected: "${SAMPLE_PLAINTEXT}"\nMatches: NO`,
      )
    } catch (err) {
      setDecryptStatus(
        `❌ Decrypt failed (this is expected if the wrong vault passphrase was used).\nError: ${String(err)}`,
      )
    } finally {
      setIsWorking(false)
    }
  }

  async function handleClear() {
    await db._devTestCiphertext.clear()
    setEncryptStatus(null)
    setDecryptStatus(null)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-xl border border-border bg-card p-4 shadow-xl text-xs font-mono">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-foreground text-sm">🛠 Dev: Round-trip Test</span>
        <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-700 dark:text-yellow-300">
          TEMP · DEV ONLY
        </span>
      </div>
      <p className="mb-3 text-muted-foreground leading-relaxed">
        Tests encrypt → IndexedDB → reload → decrypt. Remove before v1.0.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={handleEncrypt}
          disabled={isWorking}
          className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isWorking ? 'Working…' : 'Encrypt sample string'}
        </button>
        <button
          onClick={handleDecrypt}
          disabled={isWorking}
          className="rounded bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
        >
          Decrypt stored ciphertext
        </button>
        <button
          onClick={handleClear}
          className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>

      {encryptStatus && (
        <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-muted-foreground mb-2">
          {encryptStatus}
        </pre>
      )}
      {decryptStatus && (
        <pre
          className={`whitespace-pre-wrap rounded p-2 ${
            decryptStatus.startsWith('✅')
              ? 'bg-green-500/10 text-green-700 dark:text-green-300'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {decryptStatus}
        </pre>
      )}
    </div>
  )
}
