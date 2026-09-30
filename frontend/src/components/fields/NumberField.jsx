import { useId, useState } from 'react'
import FieldRow from './FieldRow.jsx'
import { inputClass } from './fieldStyles.js'
import { parseNumberInput } from './parseNumberInput.js'
import { useCommitOnUnmount } from './useCommitOnUnmount.js'

/**
 * Number input with a "draft" while typing.
 *
 * While you type, the input shows exactly what you typed (the draft), even if
 * it's temporarily invalid ("" or "10" on the way to "1024"). Valid values are
 * sent to the store immediately; invalid ones show an error. On blur the draft
 * is dropped and the input shows the stored (clamped, step-snapped) value again.
 *
 * @param {{ field: { key: string, label: string, unit: string, min: number, max: number }, value: number, onCommit: (value: number) => void }} props
 */
function NumberField({ field, value, onCommit }) {
  const id = useId()
  const [draft, setDraft] = useState(null) // null → not editing, show the stored value
  const [error, setError] = useState(null)
  // Valid drafts are already committed; this catches an out-of-range one (the store clamps it).
  useCommitOnUnmount(draft, (text) => {
    const { value: parsed } = parseNumberInput(field, text)
    if (parsed !== null) onCommit(parsed)
  })

  function handleChange(event) {
    const text = event.target.value
    setDraft(text)
    const result = parseNumberInput(field, text)
    setError(result.error)
    if (result.error === null) onCommit(result.value)
  }

  function handleBlur() {
    if (draft !== null) {
      const { value: parsed } = parseNumberInput(field, draft)
      // Out-of-range numbers are committed and the store clamps them;
      // unparseable text is discarded and the old value stays.
      if (parsed !== null) onCommit(parsed)
    }
    setDraft(null)
    setError(null)
  }

  return (
    <FieldRow id={id} label={field.label} unit={field.unit} error={error}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
    </FieldRow>
  )
}

export default NumberField
