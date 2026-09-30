import { getComponentType } from '@systemsim/engine'
import { MAX_LABEL_LENGTH, useArchitectureStore } from '../store/architectureStore.js'
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
    <div className="space-y-3" onBlur={endEdit}>
      {/* The panel header already shows the icon and type name. */}
      <p className="text-xs text-ink-muted">{def.description}</p>

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
