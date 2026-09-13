import { beforeEach, describe, expect, it } from 'vitest'
import { useUploadQueueStore } from './uploadQueue'

function makeFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name)
}

beforeEach(() => {
  useUploadQueueStore.setState({ entries: [], files: {} })
})

describe('useUploadQueueStore', () => {
  it('enqueues files as queued entries scoped to the given folder', () => {
    useUploadQueueStore.getState().enqueue([makeFile('a.mp4', 10), makeFile('b.mp4', 20)], 'f-1')

    const entries = useUploadQueueStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      folderId: 'f-1',
      fileName: 'a.mp4',
      fileSize: 10,
      status: 'queued',
    })
    expect(entries[1]).toMatchObject({ fileName: 'b.mp4', fileSize: 20, status: 'queued' })
    expect(entries[0]?.localId).not.toBe(entries[1]?.localId)
  })

  it('dedupes same filename+size within one enqueue call, marking the extra as skipped', () => {
    useUploadQueueStore
      .getState()
      .enqueue([makeFile('a.mp4', 10), makeFile('a.mp4', 10), makeFile('a.mp4', 99)], 'f-1')

    const entries = useUploadQueueStore.getState().entries
    expect(entries).toHaveLength(3)
    expect(entries[0]?.status).toBe('queued')
    expect(entries[1]?.status).toBe('skipped')
    // Different size, same name: not a duplicate.
    expect(entries[2]?.status).toBe('queued')
  })

  it('does not dedupe across separate enqueue calls', () => {
    useUploadQueueStore.getState().enqueue([makeFile('a.mp4', 10)], 'f-1')
    useUploadQueueStore.getState().enqueue([makeFile('a.mp4', 10)], 'f-1')

    const entries = useUploadQueueStore.getState().entries
    expect(entries).toHaveLength(2)
    expect(entries.every((e) => e.status === 'queued')).toBe(true)
  })

  it('updateStatus patches only the targeted entry', () => {
    useUploadQueueStore.getState().enqueue([makeFile('a.mp4', 10), makeFile('b.mp4', 20)], 'f-1')
    const [first, second] = useUploadQueueStore.getState().entries

    useUploadQueueStore.getState().updateStatus(first!.localId, { status: 'uploading' })

    const entries = useUploadQueueStore.getState().entries
    expect(entries.find((e) => e.localId === first!.localId)?.status).toBe('uploading')
    expect(entries.find((e) => e.localId === second!.localId)?.status).toBe('queued')
  })

  it('dismiss removes just the targeted entry', () => {
    useUploadQueueStore.getState().enqueue([makeFile('a.mp4', 10), makeFile('b.mp4', 20)], 'f-1')
    const [first, second] = useUploadQueueStore.getState().entries

    useUploadQueueStore.getState().dismiss(first!.localId)

    const entries = useUploadQueueStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.localId).toBe(second!.localId)
  })

  it('clearCompleted removes only ready entries, leaving others intact', () => {
    useUploadQueueStore
      .getState()
      .enqueue([makeFile('a.mp4', 10), makeFile('b.mp4', 20), makeFile('c.mp4', 30)], 'f-1')
    const [a, b, c] = useUploadQueueStore.getState().entries
    useUploadQueueStore.getState().updateStatus(a!.localId, { status: 'ready' })
    useUploadQueueStore.getState().updateStatus(b!.localId, { status: 'failed', error: 'oops' })
    // c stays 'queued'

    useUploadQueueStore.getState().clearCompleted()

    const entries = useUploadQueueStore.getState().entries
    expect(entries.map((e) => e.localId).sort()).toEqual([b!.localId, c!.localId].sort())
  })
})
