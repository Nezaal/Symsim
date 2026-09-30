/**
 * Min-heap of scheduled events, ordered by time, then by insertion order.
 * The insertion-order tie-breaker keeps runs deterministic when several events
 * share a timestamp.
 *
 * Mutable by design: this is the simulator's hot loop (millions of pushes and
 * pops per run), where allocating new arrays per operation would dominate.
 */
export interface ScheduledEvent<T> {
  readonly time: number
  readonly seq: number
  readonly payload: T
}

export class EventQueue<T> {
  private readonly heap: ScheduledEvent<T>[] = []
  private nextSeq = 0

  get size(): number {
    return this.heap.length
  }

  /** Time of the earliest event, or Infinity when empty. */
  peekTime(): number {
    return this.heap[0]?.time ?? Infinity
  }

  push(time: number, payload: T): void {
    this.heap.push({ time, seq: this.nextSeq, payload })
    this.nextSeq += 1
    this.siftUp(this.heap.length - 1)
  }

  pop(): ScheduledEvent<T> | undefined {
    const top = this.heap[0]
    const last = this.heap.pop()
    if (top !== undefined && last !== undefined && this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return top
  }

  private before(a: ScheduledEvent<T>, b: ScheduledEvent<T>): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq)
  }

  private siftUp(start: number): void {
    const heap = this.heap
    let i = start
    while (i > 0) {
      const parent = (i - 1) >> 1
      const node = heap[i]!
      const up = heap[parent]!
      if (!this.before(node, up)) break
      heap[i] = up
      heap[parent] = node
      i = parent
    }
  }

  private siftDown(start: number): void {
    const heap = this.heap
    const n = heap.length
    let i = start
    for (;;) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < n && this.before(heap[left]!, heap[smallest]!)) smallest = left
      if (right < n && this.before(heap[right]!, heap[smallest]!)) smallest = right
      if (smallest === i) return
      const tmp = heap[i]!
      heap[i] = heap[smallest]!
      heap[smallest] = tmp
      i = smallest
    }
  }
}
