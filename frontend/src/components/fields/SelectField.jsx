import { useId } from 'react'
import FieldRow from './FieldRow.jsx'
import { inputClass } from './fieldStyles.js'

/**
 * @param {{ field: { label: string, options: { value: string, label: string }[] }, value: string, onCommit: (value: string) => void }} props
 */
function SelectField({ field, value, onCommit }) {
  const id = useId()
  return (
    <FieldRow id={id} label={field.label}>
      <select
        id={id}
        value={value}
        onChange={(event) => onCommit(event.target.value)}
        className={inputClass}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

export default SelectField
