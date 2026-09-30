/**
 * Validates what the user typed into a number field.
 * Pure function: returns a result instead of touching state.
 *
 * @param {{ min: number, max: number }} field
 * @param {string} text
 * @returns {{ value: number | null, error: string | null }}
 */
export function parseNumberInput(field, text) {
  // Commas allowed: values and error messages are displayed as "1,024".
  const trimmed = String(text).trim().replaceAll(',', '')
  if (trimmed === '') return { value: null, error: 'Enter a number.' }

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { value: null, error: 'Enter a number.' }

  if (value < field.min || value > field.max) {
    return {
      value,
      error: `Must be between ${field.min.toLocaleString('en-US')} and ${field.max.toLocaleString('en-US')}.`,
    }
  }
  return { value, error: null }
}
