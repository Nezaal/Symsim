/**
 * Chart colors (dark theme). Categorical slots in fixed order, validated with
 * the dataviz palette checker against our surface #13161b:
 * all six checks pass (worst adjacent CVD ΔE 9.4, contrast ≥ 3:1).
 * Status colors are reserved for good/warning/critical state, always paired
 * with a text label so color never carries meaning alone.
 */
export const SERIES = Object.freeze(['#3987e5', '#d95926', '#199e70'])

export const STATUS = Object.freeze({
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
})

/** Utilization → status: <70% good, <95% warning, else critical. */
export function utilizationStatus(u) {
  if (u >= 0.95) return 'critical'
  if (u >= 0.7) return 'warning'
  return 'good'
}

export const CHART = Object.freeze({
  grid: '#262b33',
  axis: '#8b929c',
  text: '#e6e8eb',
  surface: '#1a1e24',
})
