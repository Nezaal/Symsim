import { useId, useState } from 'react'
import FieldRow from './FieldRow.jsx'
import { inputClass } from './fieldStyles.js'
import { useCommitOnUnmount } from './useCommitOnUnmount.js'

/**
 * Text input that commits on blur or Enter (not on every keystroke), so the
 * store can trim whitespace without eating the space you just typed.
 *
 * @param {{ label: string, value: string, maxLength: number, onCommit: (value: string) => void }} props
 */
function TextField({ label, value, maxLength, onCommit }) {
  const id = useId()
  const [draft, setDraft] = useState(null)
  useCommitOnUnmount(draft, onCommit)

  function handleBlur() {
    if (draft !== null) onCommit(draft)
    setDraft(null)
  }

  return (
    <FieldRow id={id} label={label}>
      <input
        id={id}
        type="text"
        value={draft ?? value}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        className={inputClass}
      />
    </FieldRow>
  )
}

export default TextField
