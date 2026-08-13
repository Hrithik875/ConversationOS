/**
 * MediaBubble.tsx — Renders media messages (images, docs, missing media).
 *
 * Handles:
 * - Images: lazy-decrypted from OPFS, rendered inline
 * - Missing media (matched: false): placeholder with filename
 * - Non-image media: icon + filename + size + download button
 *
 * Object URLs are managed via the mediaCache.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '@/lib/db'
import { useVaultStore } from '@/stores/vaultStore'
import { getCachedMediaUrl } from '@/lib/viewer/mediaCache'
import type { MediaEntry } from '@/types/import'

interface MediaBubbleProps {
  content: string
  senderRaw: string | null
  timestamp: string
  isSelf: boolean
  mediaRef: number | null
  onImageClick?: (url: string) => void
}

export function MediaBubble({
  content,
  senderRaw,
  timestamp,
  isSelf,
  mediaRef,
  onImageClick,
}: MediaBubbleProps) {
  const [media, setMedia] = useState<MediaEntry | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const derivedKey = useVaultStore((s) => s.derivedKey)

  const formattedTime = useMemo(() => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [timestamp])

  // Load media entry from Dexie
  useEffect(() => {
    if (mediaRef === null) return
    db.media.get(mediaRef).then((entry) => {
      if (entry) setMedia(entry)
    })
  }, [mediaRef])

  const isImage = media?.mimeType?.startsWith('image/')
  const isMatched = media?.matched ?? false

  // Decrypt and load image
  useEffect(() => {
    if (!media || !isImage || !isMatched || !derivedKey || media.id === undefined) return
    if (mediaUrl) return // Already loaded

    let cancelled = false
    getCachedMediaUrl(media.id, media.opfsPath, media.encryptedIv, media.mimeType, derivedKey)
      .then((url) => {
        if (!cancelled) {
          setMediaUrl(url)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Failed to decrypt: ${String(err)}`)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [media, isImage, isMatched, derivedKey, mediaUrl])

  const handleDownload = useCallback(async () => {
    if (!media || !derivedKey || !isMatched || media.id === undefined) return
    setLoading(true)
    try {
      const url = await getCachedMediaUrl(
        media.id,
        media.opfsPath,
        media.encryptedIv,
        media.mimeType,
        derivedKey,
      )
      const a = document.createElement('a')
      a.href = url
      a.download = media.originalFilename
      a.click()
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [media, derivedKey, isMatched])

  // Missing media placeholder
  if (media && !isMatched) {
    return (
      <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[75%] rounded-2xl border border-dashed px-3.5 py-3 ${
            isSelf ? 'rounded-br-md border-amber-500/30 bg-amber-500/5' : 'rounded-bl-md border-border bg-muted/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Media not found in export</p>
              <p className="text-[10px] text-muted-foreground/60">{media.originalFilename}</p>
            </div>
          </div>
          <p className="mt-1.5 text-right text-[10px] text-muted-foreground/60">{formattedTime}</p>
        </div>
      </div>
    )
  }

  // <Media omitted> (no mediaRef at all or mediaRef is null)
  if (mediaRef === null) {
    return (
      <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
            isSelf ? 'rounded-br-md bg-primary/10 text-foreground' : 'rounded-bl-md bg-muted/50 text-foreground'
          }`}
        >
          <p className="text-xs italic text-muted-foreground">{content}</p>
          <p className="mt-1 text-right text-[10px] text-muted-foreground/60">{formattedTime}</p>
        </div>
      </div>
    )
  }

  // Image rendering
  if (isImage && isMatched) {
    return (
      <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[75%] overflow-hidden rounded-2xl shadow-sm ${
            isSelf ? 'rounded-br-md bg-primary' : 'rounded-bl-md bg-muted'
          }`}
        >
          {senderRaw && !isSelf && (
            <p className="px-3 pt-2 text-xs font-semibold text-foreground">{senderRaw}</p>
          )}
          {loading && (
            <div className="flex h-48 w-64 items-center justify-center bg-muted/50">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {error && (
            <div className="flex h-48 w-64 items-center justify-center bg-destructive/10 px-4">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt={media?.originalFilename ?? 'Image'}
              className="max-h-80 w-full cursor-pointer object-cover"
              onClick={() => onImageClick?.(mediaUrl)}
              loading="lazy"
            />
          )}
          <p
            className={`px-3 py-1.5 text-right text-[10px] ${
              isSelf ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {formattedTime}
          </p>
        </div>
      </div>
    )
  }

  // Generic non-image media fallback
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
          isSelf ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        {senderRaw && !isSelf && (
          <p className="mb-1 text-xs font-semibold">{senderRaw}</p>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/20">
            {getFileIcon(media?.mimeType)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{media?.originalFilename ?? 'File'}</p>
            {media?.sizeBytes !== undefined && (
              <p className={`text-[10px] ${isSelf ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                {formatFileSize(media.sizeBytes)}
              </p>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="shrink-0 rounded-full p-1.5 hover:bg-background/20"
            title="Download"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </button>
        </div>
        <p className={`mt-1.5 text-right text-[10px] ${isSelf ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {formattedTime}
        </p>
      </div>
    </div>
  )
}

function getFileIcon(mimeType?: string) {
  const iconClass = 'h-5 w-5 text-current opacity-70'
  if (mimeType?.startsWith('video/')) {
    return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
  }
  if (mimeType?.startsWith('audio/')) {
    return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
  }
  return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
