import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2Off, Share2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useHasUnsavedChanges, useProjectStore } from '../../store/projectStore.js'
import { ghostButton } from '../../lib/buttonStyles.js'
import { inputClass } from '../fields/fieldStyles.js'

/**
 * Creates (or reuses) a read-only public link to the latest saved version,
 * with Copy and "Turn off". Links are frozen to that version: later edits don't
 * change what viewers see.
 */
function ShareButton() {
  const { version, busy, share, createShareLink, revokeShareLink } = useProjectStore(
    useShallow((s) => ({
      version: s.version,
      busy: s.busy,
      share: s.share,
      createShareLink: s.createShareLink,
      revokeShareLink: s.revokeShareLink,
    })),
  )
  const shareUrl = share?.url ?? null
  const unsaved = useHasUnsavedChanges()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!version) return null

  const openShare = async () => {
    setCopied(false)
    setOpen(true)
    await createShareLink(window.location.origin)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch (error) {
      console.warn('Clipboard unavailable', error)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={openShare} disabled={busy} className={`${ghostButton} flex items-center gap-1.5`}>
        <Share2 size={14} aria-hidden="true" /> Share
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-96 space-y-2 rounded-lg border border-line bg-surface p-3 shadow-lg">
          <p className="text-sm text-ink">Read-only link to version {version.number}</p>
          {unsaved && (
            <p className="text-xs text-ink-muted">Your unsaved changes aren't included. Save a version first to share them.</p>
          )}
          {shareUrl ? (
            <div className="flex gap-2">
              <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} className={inputClass} aria-label="Share link" />
              <button type="button" onClick={copy} className={`${ghostButton} flex items-center gap-1`}>
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">Creating link…</p>
          )}
          <p className="text-xs text-ink-muted">Anyone with the link can view this version without signing in.</p>
          {shareUrl && (
            <button
              type="button"
              onClick={revokeShareLink}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:underline disabled:opacity-50"
            >
              <Link2Off size={12} aria-hidden="true" /> Turn off this link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ShareButton
