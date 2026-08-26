import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { DocumentEditor } from './DocumentEditor'
import { AuthProvider } from '../../auth/AuthProvider'
import { server } from '../../test/server'
import type { Document } from '../../api/hooks/useDocuments'

const PROJECT_ID = 'p-1'
const DOCUMENT_ID = 'd-1'

const DOCUMENT: Document = {
  id: DOCUMENT_ID,
  project_id: PROJECT_ID,
  title: 'Narration',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
  },
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DocumentEditor projectId={PROJECT_ID} documentId={DOCUMENT_ID} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('DocumentEditor', () => {
  it('loads and renders the document content', async () => {
    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(DOCUMENT)))
    renderEditor()

    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })

  it('debounces edits into a PATCH with the last-known version', async () => {
    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(DOCUMENT)))
    let body: unknown
    server.use(
      http.patch('http://localhost:8000/documents/d-1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...DOCUMENT, version: 2 })
      }),
    )
    renderEditor()
    const paragraph = await screen.findByText('Hello')

    await userEvent.click(paragraph)
    await userEvent.type(paragraph, ' there')

    await waitFor(
      () => {
        expect(body).toMatchObject({ expected_version: 1 })
      },
      { timeout: 3000 },
    )
  })

  it('shows a conflict banner on a stale version and reloads on demand', async () => {
    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(DOCUMENT)))
    server.use(
      http.patch('http://localhost:8000/documents/d-1', () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'stale' } }, { status: 409 }),
      ),
    )
    renderEditor()
    const paragraph = await screen.findByText('Hello')

    await userEvent.click(paragraph)
    await userEvent.type(paragraph, '!')

    expect(
      await screen.findByText(/edited by someone else/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument()

    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(DOCUMENT)))
    await userEvent.click(screen.getByText('Reload'))

    await waitFor(() => {
      expect(screen.queryByText(/edited by someone else/)).not.toBeInTheDocument()
    })
  })
})
