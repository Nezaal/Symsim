import { describe, expect, it } from 'vitest'
import { connectionError, type GraphNodeLike } from './graphRules.ts'

const node = (id: string, componentType: string): GraphNodeLike => ({ id, data: { componentType } })
const nodes = [
  node('c', 'client'),
  node('lb', 'loadBalancer'),
  node('app', 'appServer'),
  node('db', 'sqlDatabase'),
]
const edges = [{ id: 'e1', source: 'c', target: 'lb' }]

describe('connectionError', () => {
  it('accepts a valid new connection', () => {
    expect(connectionError({ source: 'lb', target: 'app' }, nodes, edges)).toBeNull()
  })

  it('rejects self-connections', () => {
    expect(connectionError({ source: 'app', target: 'app' }, nodes, edges)).toMatch(/itself/)
  })

  it('rejects duplicate connections', () => {
    expect(connectionError({ source: 'c', target: 'lb' }, nodes, edges)).toMatch(/already/)
  })

  it('rejects traffic flowing into a client', () => {
    expect(connectionError({ source: 'app', target: 'c' }, nodes, edges)).toMatch(/Client/)
  })

  it('rejects traffic flowing out of a terminal component', () => {
    expect(connectionError({ source: 'db', target: 'app' }, nodes, edges)).toMatch(/Relational Database/)
  })

  it('rejects connections to unknown nodes', () => {
    expect(connectionError({ source: 'c', target: 'ghost' }, nodes, edges)).toMatch(/Unknown/)
  })
})
