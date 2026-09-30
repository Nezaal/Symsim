import {
  Archive,
  Box,
  Boxes,
  Database,
  DoorOpen,
  Globe,
  ListOrdered,
  Server,
  Split,
  Users,
  Zap,
} from 'lucide-react'

/**
 * Icon per component type. UI-only, so it lives in the frontend, not the
 * engine. A test fails if a new component type is added without an icon.
 */
export const COMPONENT_ICONS = Object.freeze({
  client: Users,
  apiGateway: DoorOpen,
  loadBalancer: Split,
  appServer: Server,
  cache: Zap,
  sqlDatabase: Database,
  nosqlDatabase: Boxes,
  messageQueue: ListOrdered,
  objectStorage: Archive,
  cdn: Globe,
})

/** @param {string} type */
export function componentIcon(type) {
  return COMPONENT_ICONS[type] ?? Box
}
