/**
 * Snapshot-based undo/redo helpers. Pure functions: they take stacks and
 * return new stacks, never modifying their inputs.
 *
 * A snapshot is `{ nodes, edges }`. Because the store never mutates nodes or
 * edges, a snapshot can hold the *same* arrays the store had, with no deep copy.
 * That is what makes snapshots cheap.
 */

export const HISTORY_LIMIT = 100

/**
 * @template T
 * @param {T[]} past
 * @param {T} snapshot
 * @returns {T[]} past with snapshot appended, trimmed to HISTORY_LIMIT
 */
export function pushSnapshot(past, snapshot) {
  const next = [...past, snapshot]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

/**
 * Moves one step back: the newest `past` entry becomes the present and the
 * current present goes to the front of `future`.
 * @template T
 * @param {{ past: T[], future: T[] }} stacks
 * @param {T} present
 * @returns {{ past: T[], future: T[], present: T } | null} null when there is nothing to undo
 */
export function stepBack({ past, future }, present) {
  if (past.length === 0) return null
  return {
    past: past.slice(0, -1),
    future: [present, ...future],
    present: past[past.length - 1],
  }
}

/**
 * Mirror of stepBack.
 * @template T
 * @param {{ past: T[], future: T[] }} stacks
 * @param {T} present
 * @returns {{ past: T[], future: T[], present: T } | null} null when there is nothing to redo
 */
export function stepForward({ past, future }, present) {
  if (future.length === 0) return null
  return {
    past: pushSnapshot(past, present),
    future: future.slice(1),
    present: future[0],
  }
}
