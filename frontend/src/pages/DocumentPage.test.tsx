import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { AuthProvider } from '../auth/AuthProvider'
import { useCommentsStore } from '../store/comments'
import { useDocumentPanelStore } from '../store/documentPanel'
import { DocumentPage } from './DocumentPage'

const PROJECT_ID = 'p-1'
const DOCUMENT_ID = 'd-1'

beforeEach(() => {
  useDocumentPanelStore.setState({
    isOpen: false,
    activeProjectId: null,
    openDocumentIds: [],
    activeDocumentId: null,
    pendingInsert: null,
  })
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/projects/:projectId/documents/:documentId', element: <DocumentPage /> }],
    { initialEntries: [`/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}`] },
  )
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function baseHandlers() {
  server.use(
    http.get(`http://localhost:8000/projects/${PROJECT_ID}/documents`, () =>
      HttpResponse.json([
        { id: DOCUMENT_ID, title: 'Narration', version: 1, updated_at: '2026-01-01T00:00:00Z' },
      ]),
    ),
    http.get(`http://localhost:8000/documents/${DOCUMENT_ID}`, () =>
      HttpResponse.json({
        id: DOCUMENT_ID,
        project_id: PROJECT_ID,
        title: 'Narration',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
        },
        version: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get(`http://localhost:8000/documents/${DOCUMENT_ID}/comments`, () =>
      HttpResponse.json([
        {
          id: 'c-1',
          created_by: 'user-a',
          text: 'note about this line',
          resolved: false,
          anchor: {
            kind: 'document',
            document_id: DOCUMENT_ID,
            clip_node_id: null,
            excerpt: 'there',
          },
          created_at: '2026-01-01T00:00:00Z',
          replies: [],
        },
      ]),
    ),
  )
}

describe('DocumentPage', () => {
  it('shows the document as an open tab, its content, and its comments', async () => {
    baseHandlers()
    renderPage()

    expect(await screen.findByRole('button', { name: 'Narration' })).toBeInTheDocument()
    expect(await screen.findByText('Hello there')).toBeInTheDocument()
    expect(await screen.findByText('note about this line')).toBeInTheDocument()
  })

  it('has a back button', async () => {
    baseHandlers()
    renderPage()
    await screen.findByText('Hello there')

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('selects a comment in the shared store when clicked in the side panel', async () => {
    baseHandlers()
    renderPage()
    await screen.findByText('note about this line')

    await userEvent.click(screen.getByText('"there"'))

    await waitFor(() => expect(useCommentsStore.getState().selectedId).toBe('c-1'))
  })
})
