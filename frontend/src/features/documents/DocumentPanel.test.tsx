import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DocumentPanel } from './DocumentPanel'
import { AuthProvider } from '../../auth/AuthProvider'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { server } from '../../test/server'
import type { DocumentSummary } from '../../api/hooks/useDocuments'
import type { RefObject } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

const PROJECT_ID = 'p-1'

const SUMMARIES: DocumentSummary[] = [
  { id: 'd-1', title: 'Narration', version: 1, updated_at: '2026-01-02T00:00:00Z' },
]

function documentBody(id: string, title: string, version = 1) {
  return {
    id,
    project_id: PROJECT_ID,
    title,
    content: { type: 'doc', content: [] },
    version,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function renderPanel(
  panelRef?: RefObject<PanelImperativeHandle | null>,
  origin?: { originLabel?: string | null; originPath?: string },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <DocumentPanel
          panelRef={panelRef}
          originLabel={origin?.originLabel}
          originPath={origin?.originPath}
        />
      ),
    },
    { path: '/projects/:projectId/documents/:documentId', element: <div>Fullscreen page</div> },
  ])
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}

function fakePanelRef(): RefObject<PanelImperativeHandle | null> & {
  collapse: ReturnType<typeof vi.fn>
  expand: ReturnType<typeof vi.fn>
} {
  const collapse = vi.fn()
  const expand = vi.fn()
  const handle: PanelImperativeHandle = {
    collapse,
    expand,
    getSize: () => ({ asPercentage: 0, inPixels: 0 }),
    isCollapsed: () => false,
    resize: () => {},
  }
  return Object.assign({ current: handle }, { collapse, expand })
}

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    openDocumentIds: [],
    activeDocumentId: null,
    pendingInsert: null,
  })
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
      HttpResponse.json(SUMMARIES),
    ),
    http.get('http://localhost:8000/documents/d-1', () =>
      HttpResponse.json(documentBody('d-1', 'Narration')),
    ),
  )
})

describe('DocumentPanel', () => {
  it('shows a disabled toggle rail with no active project', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Open document panel' })).toBeDisabled()
  })

  it('opens on toggle click once a project is active', async () => {
    useDocumentPanelStore.setState({ activeProjectId: PROJECT_ID })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Open document panel' }))
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)
  })

  it('lists documents and opens the first one as a tab', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    renderPanel()

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1'])
    expect(screen.getByRole('button', { name: 'Narration' })).toBeInTheDocument()
  })

  it('creates a document via the New dialog and opens it as a tab', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    server.use(
      http.post(`http://localhost:8000/projects/${PROJECT_ID}/documents`, async ({ request }) => {
        const body = (await request.json()) as { title: string }
        return HttpResponse.json(documentBody('d-2', body.title), { status: 201 })
      }),
      http.get('http://localhost:8000/documents/d-2', () =>
        HttpResponse.json(documentBody('d-2', 'Interview notes')),
      ),
    )
    renderPanel()
    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))

    await userEvent.click(screen.getByRole('button', { name: 'New document' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Document title' }), 'Interview notes')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-2'))
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1', 'd-2'])
  })

  it('opens an existing document from the "+" picker as a new tab, keeping the first tab open', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
        HttpResponse.json([
          ...SUMMARIES,
          { id: 'd-2', title: 'B-roll notes', version: 1, updated_at: '2026-01-03T00:00:00Z' },
        ]),
      ),
      http.get('http://localhost:8000/documents/d-2', () =>
        HttpResponse.json(documentBody('d-2', 'B-roll notes')),
      ),
    )
    renderPanel()
    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))

    await userEvent.click(screen.getByRole('button', { name: 'Open existing document' }))
    await userEvent.click(await screen.findByRole('button', { name: 'B-roll notes' }))

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-2'))
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual(['d-1', 'd-2'])
  })

  it('renames a tab from its options menu', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    // The active tab's own `DocumentEditor` is mounted alongside the tab
    // strip and may autosave its (unrelated, content-only) debounce
    // independently — collect every PATCH rather than assuming the rename's
    // is the only or the last one to land.
    const patchBodies: unknown[] = []
    server.use(
      http.patch('http://localhost:8000/documents/d-1', async ({ request }) => {
        patchBodies.push(await request.json())
        return HttpResponse.json(documentBody('d-1', 'Renamed', 2))
      }),
    )
    renderPanel()
    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))

    await userEvent.click(await screen.findByRole('button', { name: 'Narration options' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename Narration' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed{Enter}')

    await waitFor(() =>
      expect(patchBodies).toContainEqual({ title: 'Renamed', expected_version: 1 }),
    )
  })

  it('deletes a tab from its options menu and clears selection once none remain', async () => {
    useDocumentPanelStore.setState({
      isOpen: true,
      activeProjectId: PROJECT_ID,
      openDocumentIds: ['d-1'],
      activeDocumentId: 'd-1',
    })
    // The list still includes "Narration" until the delete actually lands —
    // otherwise the tab (whose label comes from this list) could never
    // render in the first place. Once deleted, the list mirrors a real
    // backend by no longer returning it, so the auto-select effect (which
    // would otherwise legitimately re-pick a still-listed document) sees an
    // empty list and leaves the selection cleared.
    let deleted = false
    server.use(
      http.delete('http://localhost:8000/documents/d-1', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
        HttpResponse.json(deleted ? [] : SUMMARIES),
      ),
    )
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Narration options' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBeNull())
    expect(useDocumentPanelStore.getState().openDocumentIds).toEqual([])
  })

  it('navigates to the fullscreen page for the active document from the header button', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    const router = renderPanel()
    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))

    await userEvent.click(screen.getByRole('button', { name: 'Open fullscreen' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/documents/d-1`),
    )
  })

  it('carries the current page as router state so fullscreen can go back to it', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    const router = renderPanel(undefined, { originLabel: 'Clip.mp4', originPath: '/videos/v-1' })
    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))

    await userEvent.click(screen.getByRole('button', { name: 'Open fullscreen' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${PROJECT_ID}/documents/d-1`),
    )
    expect(router.state.location.state).toEqual({
      originLabel: 'Clip.mp4',
      originPath: '/videos/v-1',
    })
  })

  it('disables the fullscreen button with no document open', () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    server.use(
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
        HttpResponse.json([]),
      ),
    )
    renderPanel()

    expect(screen.getByRole('button', { name: 'Open fullscreen' })).toBeDisabled()
  })

  describe('panel collapse/expand bridging', () => {
    // The real `Panel` geometry can't be asserted on in jsdom (the group's
    // pixel width is always 0 — see `test/setup.ts`'s `ResizeObserver` stub
    // comment), so this exercises the bridging effect itself against a fake
    // `panelRef`, rather than the library's actual layout output.
    it('collapses the given panelRef when isOpen is false, on mount', () => {
      useDocumentPanelStore.setState({ isOpen: false, activeProjectId: PROJECT_ID })
      const panelRef = fakePanelRef()

      renderPanel(panelRef)

      expect(panelRef.collapse).toHaveBeenCalledTimes(1)
      expect(panelRef.expand).not.toHaveBeenCalled()
    })

    it('expands the given panelRef once isOpen flips to true', async () => {
      useDocumentPanelStore.setState({ isOpen: false, activeProjectId: PROJECT_ID })
      const panelRef = fakePanelRef()
      renderPanel(panelRef)

      useDocumentPanelStore.setState({ isOpen: true })

      await waitFor(() => expect(panelRef.expand).toHaveBeenCalledTimes(1))
    })

    it('collapses again once isOpen flips back to false', async () => {
      useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
      const panelRef = fakePanelRef()
      renderPanel(panelRef)
      expect(panelRef.expand).toHaveBeenCalledTimes(1)

      useDocumentPanelStore.setState({ isOpen: false })

      await waitFor(() => expect(panelRef.collapse).toHaveBeenCalledTimes(1))
    })
  })
})
