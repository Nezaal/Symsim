import { TEMPLATES } from '@systemsim/engine'
import { useLoadTemplate } from '../hooks/useLoadTemplate.js'

/** Shown on the empty canvas: start from a template or from scratch. */
function TemplatePicker() {
  const loadTemplate = useLoadTemplate()

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-medium text-ink">Start from a template</p>
        <p className="mt-1 text-xs text-ink-muted">You can change everything after it loads.</p>
      </div>

      <ul className="space-y-2">
        {TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => loadTemplate(template.id)}
              className="w-full rounded-lg border border-line bg-surface p-3 text-left hover:border-accent focus-visible:border-accent focus-visible:outline-none"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{template.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {template.nodes.length} components
                </span>
              </span>
              <span className="mt-1 block text-xs text-ink-muted">{template.description}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-center text-xs text-ink-muted">
        …or add components from the ☰ menu to start from a blank canvas.
      </p>
    </div>
  )
}

export default TemplatePicker
