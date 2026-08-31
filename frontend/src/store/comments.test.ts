import { beforeEach, describe, expect, it } from 'vitest'
import { useCommentsStore } from './comments'

beforeEach(() => {
  useCommentsStore.setState({ openIds: new Set(), selectedId: null, hoveredId: null })
})

describe('useCommentsStore', () => {
  it('selects and hovers independently', () => {
    useCommentsStore.getState().select('c-1')
    useCommentsStore.getState().hover('c-2')

    expect(useCommentsStore.getState().selectedId).toBe('c-1')
    expect(useCommentsStore.getState().hoveredId).toBe('c-2')

    useCommentsStore.getState().hover(null)
    expect(useCommentsStore.getState().selectedId).toBe('c-1')
    expect(useCommentsStore.getState().hoveredId).toBeNull()
  })

  it('toggles a reply thread open state', () => {
    useCommentsStore.getState().toggleOpen('c-1')
    expect(useCommentsStore.getState().openIds.has('c-1')).toBe(true)

    useCommentsStore.getState().toggleOpen('c-1')
    expect(useCommentsStore.getState().openIds.has('c-1')).toBe(false)
  })
})
