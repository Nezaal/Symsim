import { createElement } from 'react'
import { componentIcon } from '../lib/componentIcons.js'

/**
 * Decorative icon for a component type (hidden from screen readers; the
 * label next to it carries the meaning).
 * @param {{ type: string, size?: number, color?: string }} props
 */
function ComponentIcon({ type, size = 16, color }) {
  return createElement(componentIcon(type), { size, color, 'aria-hidden': true, className: 'shrink-0' })
}

export default ComponentIcon
