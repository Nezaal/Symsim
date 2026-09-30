import { useEffect, useRef } from 'react'

/**
 * If the field disappears while you still have an uncommitted draft (e.g. the
 * panel switches to another node before the input blurs), commit it anyway.
 *
 * Refs hold the latest draft/commit so the cleanup runs only once, on unmount,
 * but still sees current values.
 *
 * @param {string | null} draft  null when nothing is pending
 * @param {(draft: string) => void} commit
 */
export function useCommitOnUnmount(draft, commit) {
  const latest = useRef({ draft, commit })

  useEffect(() => {
    latest.current = { draft, commit }
  })

  useEffect(
    () => () => {
      const { draft: pending, commit: commitPending } = latest.current
      if (pending !== null) commitPending(pending)
    },
    [],
  )
}
