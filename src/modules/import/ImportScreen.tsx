/**
 * ImportScreen.tsx — File picker / drag-drop entry point for chat imports.
 *
 * Shown when the vault is unlocked and no import is in progress.
 * Accepts .zip files via file picker or drag-and-drop.
 */

import { useState, useRef, useCallback } from 'react'
import { useImportStore } from '@/stores/importStore'
import { useVaultStore } from '@/stores/vaultStore'

export function ImportScreen() {
  const startImport = useImportStore((s) => s.startImport)
  const derivedKey = useVaultStore((s) => s.derivedKey)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)

      if (!file.name.toLowerCase().endsWith('.zip')) {
        setError('Please select a .zip file (WhatsApp chat export).')
        return
      }

      if (!derivedKey) {
        setError('Vault is not unlocked. Please unlock the vault first.')
        return
      }

      startImport(file, derivedKey)
    },
    [derivedKey, startImport],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Import Chat</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Import a WhatsApp chat export (.zip file) to archive your conversations.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex w-full max-w-md cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        }`}
      >
        <svg
          className="mb-4 h-12 w-12 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-foreground">
          {isDragging ? 'Drop your file here' : 'Drag & drop your .zip file'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="max-w-md rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-2">How to export from WhatsApp:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open a chat in WhatsApp</li>
          <li>Tap ⋮ (menu) → More → Export chat</li>
          <li>Choose &quot;Include media&quot; for full archive</li>
          <li>Save the .zip file and import it here</li>
        </ol>
      </div>
    </div>
  )
}
