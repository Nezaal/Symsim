import { getComponentType } from '@systemsim/engine'
import { MAX_LABEL_LENGTH, useArchitectureStore } from '../store/architectureStore.js'
import { categoryColor } from '../lib/categories.js'
import NumberField from './fields/NumberField.jsx'
import SelectField from './fields/SelectField.jsx'
import TextField from './fields/TextField.jsx'

const FIELD_COMPONENTS = { number: NumberField, select: SelectField }

/**
 * Settings form for one node. There is no hand-written form per component:
 * we loop over the engine definition's `fields` and pick an input by `kind`.
 * Adding a field to the engine makes it appear here automatically.
 *
 * @param {{ node: { id: string, data: { componentType: string, label: string, config: Record<string, number | string> } } }} props
 */
function NodeSettings({ node }) {
  const updateNodeConfig = useArchitectureStore((s) => s.updateNodeConfig)
  const updateNodeLabel = useArchitectureStore((s) => s.updateNodeLabel)
  const endEdit = useArchitectureStore((s) => s.endEdit)
  const def = getComponentType(node.data.componentType)

  // onBlur bubbles up from any field (after the field's own blur commit), so
  // leaving a field closes its editing session: the next edit is a new undo step.
  return (
    <div className="space-y-4" onBlur={endEdit}>
      <header>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: categoryColor(def.category) }}
          />
          {def.label}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{def.description}</p>
      </header>

      <TextField
        label="Name"
        value={node.data.label}
        maxLength={MAX_LABEL_LENGTH}
        onCommit={(label) => updateNodeLabel(node.id, label)}
      />

      {def.fields.map((field) => {
        const Field = FIELD_COMPONENTS[field.kind]
        return (
          <Field
            key={field.key}
            field={field}
            value={node.data.config[field.key]}
            onCommit={(value) => updateNodeConfig(node.id, field.key, value)}
          />
        )
      })}
    </div>
  )
}

export default NodeSettings
