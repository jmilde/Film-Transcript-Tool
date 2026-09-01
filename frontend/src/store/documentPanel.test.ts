import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentPanelStore } from './documentPanel'

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    openDocumentIds: [],
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

  it('opens tabs and switches the active one without duplicating', () => {
    useDocumentPanelStore.getState().openTab('d-1')
    useDocumentPanelStore.getState().openTab('d-2')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1', 'd-2'])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-2')

    useDocumentPanelStore.getState().openTab('d-1')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1', 'd-2'])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1')
  })

  it('closing the active tab activates its right-hand neighbor, or the left if it was last', () => {
    useDocumentPanelStore.getState().openTab('d-1')
    useDocumentPanelStore.getState().openTab('d-2')
    useDocumentPanelStore.getState().openTab('d-3')
    useDocumentPanelStore.getState().openTab('d-2') // make the middle tab active

    useDocumentPanelStore.getState().closeTab('d-2')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1', 'd-3'])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-3')

    useDocumentPanelStore.getState().closeTab('d-3')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1'])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1')
  })

  it('closing a non-active tab leaves the active one untouched', () => {
    useDocumentPanelStore.getState().openTab('d-1')
    useDocumentPanelStore.getState().openTab('d-2')

    useDocumentPanelStore.getState().closeTab('d-1')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-2'])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-2')
  })

  it('clears the insert-marker flag when the active document switches', () => {
    useDocumentPanelStore.getState().openTab('d-1')
    useDocumentPanelStore.getState().setInsertMarkerDocumentId('d-1')
    expect(useDocumentPanelStore.getState().insertMarkerDocumentId).toBe('d-1')

    useDocumentPanelStore.getState().openTab('d-2')
    expect(useDocumentPanelStore.getState().insertMarkerDocumentId).toBeNull()
  })

  it('resets open tabs when the active project actually changes, not on a same-project re-set', () => {
    useDocumentPanelStore.getState().setActiveProject('p-1')
    useDocumentPanelStore.getState().openTab('d-1')

    useDocumentPanelStore.getState().setActiveProject('p-1')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1'])

    useDocumentPanelStore.getState().setActiveProject('p-2')
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual([])
    expect(useDocumentPanelStore.getState().activeDocumentId).toBeNull()
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
