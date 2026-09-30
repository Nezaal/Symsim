/**
 * Label + input + optional unit and error message. Layout only.
 * @param {{ id: string, label: string, unit?: string, error?: string | null, children: React.ReactNode }} props
 */
function FieldRow({ id, label, unit, error, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between text-xs text-ink-muted">
        <span>{label}</span>
        {unit && <span>{unit}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export default FieldRow
