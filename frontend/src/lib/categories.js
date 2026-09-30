/**
 * Display metadata for component categories (UI-only, so it lives in the
 * frontend rather than the engine). Colors are hex because the React Flow
 * minimap needs real color values, not Tailwind classes.
 */
export const CATEGORY_META = Object.freeze({
  traffic: { label: 'Traffic', color: '#a78bfa' },
  network: { label: 'Networking', color: '#38bdf8' },
  compute: { label: 'Compute', color: '#34d399' },
  data: { label: 'Data & Storage', color: '#f59e0b' },
  messaging: { label: 'Messaging', color: '#f472b6' },
})

export const CATEGORY_ORDER = Object.freeze(['traffic', 'network', 'compute', 'data', 'messaging'])

const FALLBACK_COLOR = '#8b929c'

/** @param {string} category */
export function categoryColor(category) {
  return CATEGORY_META[category]?.color ?? FALLBACK_COLOR
}
