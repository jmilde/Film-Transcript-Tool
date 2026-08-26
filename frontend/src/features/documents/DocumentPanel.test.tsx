import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { DocumentPanel } from './DocumentPanel'
import { AuthProvider } from '../../auth/AuthProvider'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { server } from '../../test/server'
import type { DocumentSummary } from '../../api/hooks/useDocuments'

const PROJECT_ID = 'p-1'

const SUMMARIES: DocumentSummary[] = [
  { id: 'd-1', title: 'Narration', updated_at: '2026-01-02T00:00:00Z' },
]

function documentBody(id: string, title: string) {
  return {
    id,
    project_id: PROJECT_ID,
    title,
    content: { type: 'doc', content: [] },
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DocumentPanel />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
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

  it('lists documents and auto-selects the first one', async () => {
    useDocumentPanelStore.setState({ isOpen: true, activeProjectId: PROJECT_ID })
    renderPanel()

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-1'))
    expect(screen.getByRole('option', { name: 'Narration' })).toBeInTheDocument()
  })

  it('creates a document and makes it active', async () => {
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

    await userEvent.type(screen.getByPlaceholderText('New document title…'), 'Interview notes')
    await userEvent.click(screen.getByRole('button', { name: 'New' }))

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBe('d-2'))
  })

  it('deletes the active document and clears selection once none remain', async () => {
    useDocumentPanelStore.setState({
      isOpen: true,
      activeProjectId: PROJECT_ID,
      activeDocumentId: 'd-1',
    })
    // A real backend no longer lists a deleted document once the panel
    // refetches after invalidation — mirror that so the auto-select effect
    // (which would otherwise legitimately re-pick a still-listed document)
    // sees an empty list and leaves the selection cleared.
    server.use(
      http.delete(
        'http://localhost:8000/documents/d-1',
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
        HttpResponse.json([]),
      ),
    )
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Delete document' }))

    await waitFor(() => expect(useDocumentPanelStore.getState().activeDocumentId).toBeNull())
  })
})
