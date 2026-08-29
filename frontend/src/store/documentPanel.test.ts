import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentPanelStore } from './documentPanel'

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    activeDocumentId: null,
    pendingInsert: null,
    insertMarkerDocumentId: null,
  })
})

describe('useDocumentPanelStore', () => {
  it('opens with the given project and closes independently of it', () => {
    useDocumentPanelStore.getState().open('p-1')
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)
    expect(useDocumentPanelStore.getState().activeProjectId).toBe('p-1')

    useDocumentPanelStore.getState().close()
    expect(useDocumentPanelStore.getState().isOpen).toBe(false)
    expect(useDocumentPanelStore.getState().activeProjectId).toBe('p-1')
  })

  it('syncs the active project without forcing the panel open', () => {
    useDocumentPanelStore.getState().setActiveProject('p-2')
    expect(useDocumentPanelStore.getState().activeProjectId).toBe('p-2')
    expect(useDocumentPanelStore.getState().isOpen).toBe(false)
  })

  it('tracks the active document', () => {
    useDocumentPanelStore.getState().setActiveDocument('d-1')
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1')
  })

  it('clears the insert-marker flag when the active document switches', () => {
    useDocumentPanelStore.getState().setActiveDocument('d-1')
    useDocumentPanelStore.getState().setInsertMarkerDocumentId('d-1')
    expect(useDocumentPanelStore.getState().insertMarkerDocumentId).toBe('d-1')

    useDocumentPanelStore.getState().setActiveDocument('d-2')
    expect(useDocumentPanelStore.getState().insertMarkerDocumentId).toBeNull()
  })

  it('queues an insert and opens the panel, consuming the payload once', () => {
    const payload = {
      transcriptId: 't-1',
      videoId: 'v-1',
      startTokenId: 'tok-a',
      endTokenId: 'tok-b',
    }
    useDocumentPanelStore.getState().queueInsert(payload)
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)

    expect(useDocumentPanelStore.getState().consumePendingInsert()).toEqual(payload)
    expect(useDocumentPanelStore.getState().pendingInsert).toBeNull()
    expect(useDocumentPanelStore.getState().consumePendingInsert()).toBeNull()
  })
})
