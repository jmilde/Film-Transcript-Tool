import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { DocumentEditor } from './DocumentEditor'
import { AuthProvider } from '../../auth/AuthProvider'
import { useCommentsStore } from '../../store/comments'
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

/** Selects `text.slice(start, end)` within the first text node under `root`
 * whose content includes `text`, then syncs ProseMirror's selection from the
 * DOM the same way a real mouse drag-select would (via `selectionchange`). */
function selectWithinText(root: HTMLElement, text: string, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Text | null = null
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.textContent?.includes(text)) {
      node = current as Text
      break
    }
  }
  if (!node) throw new Error(`No text node containing "${text}" found`)
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
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

  it('renders a typed "# " markdown shortcut as a visually distinct heading', async () => {
    const emptyDoc: Document = {
      ...DOCUMENT,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    }
    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(emptyDoc)))
    server.use(
      http.patch('http://localhost:8000/documents/d-1', () =>
        HttpResponse.json({ ...emptyDoc, version: 2 }),
      ),
    )
    const { container } = renderEditor()

    const editable = await waitFor(() => {
      const el = container.querySelector('[contenteditable="true"]')
      expect(el).toBeInTheDocument()
      return el as HTMLElement
    })
    expect(editable.closest('.prose')).toBeInTheDocument()

    await userEvent.click(editable)
    await userEvent.type(editable, '# Heading')

    const heading = await waitFor(() => {
      const h1 = container.querySelector('h1')
      expect(h1).toBeInTheDocument()
      return h1 as HTMLElement
    })
    expect(heading).toHaveTextContent('Heading')
  })

  describe('prose-text comments', () => {
    const PROSE_DOC: Document = {
      ...DOCUMENT,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
      },
    }

    function mockCommentRoutes() {
      server.use(
        http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(PROSE_DOC)),
      )
      server.use(
        http.patch('http://localhost:8000/documents/d-1', () =>
          HttpResponse.json({ ...PROSE_DOC, version: 2 }),
        ),
      )
      server.use(
        http.get('http://localhost:8000/documents/d-1/comments', () => HttpResponse.json([])),
      )
    }

    async function addCommentToSelection(container: HTMLElement, text: string) {
      await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
      await userEvent.type(screen.getByPlaceholderText('Add a comment…'), text)
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      await waitFor(() => {
        expect(container.querySelector('[data-comment-id]')).toBeInTheDocument()
      })
    }

    it('survives a subsequent unrelated edit at an earlier position', async () => {
      mockCommentRoutes()
      server.use(
        http.post('http://localhost:8000/documents/d-1/comments', () =>
          HttpResponse.json({
            id: 'c-1',
            created_by: 'user-a',
            text: 'note',
            resolved: false,
            anchor: {
              kind: 'document',
              document_id: DOCUMENT_ID,
              clip_node_id: null,
              excerpt: 'there',
            },
            created_at: '2026-01-01T00:00:00Z',
            replies: [],
          }),
        ),
      )
      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 6, 11) // "there"
      await waitFor(() => expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled())

      await addCommentToSelection(container, 'note')
      expect(container.querySelector('[data-comment-id]')?.textContent).toBe('there')

      // Unrelated edit earlier in the document.
      selectWithinText(container, 'Hello', 0, 0)
      await userEvent.type(paragraph, 'Oh, ')

      await waitFor(() => {
        expect(screen.getByText('Oh, Hello')).toBeInTheDocument()
      })
      expect(container.querySelector('[data-comment-id]')?.textContent).toBe('there')
    })

    it('selects the comment in the shared comments store on click', async () => {
      mockCommentRoutes()
      server.use(
        http.post('http://localhost:8000/documents/d-1/comments', () =>
          HttpResponse.json({
            id: 'c-1',
            created_by: 'user-a',
            text: 'note',
            resolved: false,
            anchor: {
              kind: 'document',
              document_id: DOCUMENT_ID,
              clip_node_id: null,
              excerpt: 'there',
            },
            created_at: '2026-01-01T00:00:00Z',
            replies: [],
          }),
        ),
      )
      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 6, 11) // "there"
      await waitFor(() => expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled())
      await addCommentToSelection(container, 'note')

      await userEvent.click(container.querySelector('[data-comment-id]') as HTMLElement)

      expect(useCommentsStore.getState().selectedId).toBe('c-1')
    })

    it('falls back to the normal conflict banner if the retried mark-set also conflicts, without looping', async () => {
      mockCommentRoutes()
      server.use(
        http.post('http://localhost:8000/documents/d-1/comments', () =>
          HttpResponse.json({
            id: 'c-1',
            created_by: 'user-a',
            text: 'note',
            resolved: false,
            anchor: {
              kind: 'document',
              document_id: DOCUMENT_ID,
              clip_node_id: null,
              excerpt: 'there',
            },
            created_at: '2026-01-01T00:00:00Z',
            replies: [],
          }),
        ),
      )
      server.use(
        http.patch('http://localhost:8000/documents/d-1', () =>
          HttpResponse.json({ error: { code: 'CONFLICT', message: 'stale' } }, { status: 409 }),
        ),
      )
      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 6, 11) // "there"
      await waitFor(() => expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled())

      await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
      await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'note')
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      // The save conflicts; the mark-set is auto-retried once against
      // reloaded content (silently — no banner for this first conflict).
      // The retry's own save conflicts too, but that is *not* auto-retried
      // again (exactly one retry) — it surfaces the normal conflict banner
      // instead, same as any other unresolved edit conflict. The comment
      // row itself still exists regardless of whether the mark ever saves.
      await waitFor(
        () => {
          expect(screen.getByText(/edited by someone else/)).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
      expect(container.querySelector('[data-comment-id]')).toBeInTheDocument()
    })
  })

  it('a clip gains an underline once a comment is added to it, surviving a reload', async () => {
    const clipDoc: Document = {
      ...DOCUMENT,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'clipBlock',
                attrs: {
                  nodeId: 'node-1',
                  transcriptId: 't-1',
                  videoId: 'v-1',
                  startTokenId: 'tok-a',
                  endTokenId: 'tok-b',
                  excerpt: 'hello there',
                },
              },
            ],
          },
        ],
      },
    }
    server.use(http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(clipDoc)))
    server.use(
      http.get('http://localhost:8000/documents/d-1/comments', () => HttpResponse.json([])),
    )
    const first = renderEditor()

    const clipSpan = await screen.findByText('hello there')
    expect(clipSpan.className).not.toContain('underline')
    first.unmount()

    server.use(
      http.get('http://localhost:8000/documents/d-1/comments', () =>
        HttpResponse.json([
          {
            id: 'c-1',
            created_by: 'user-a',
            text: 'nice',
            resolved: false,
            anchor: {
              kind: 'document',
              document_id: DOCUMENT_ID,
              clip_node_id: 'node-1',
              excerpt: 'hello there',
            },
            created_at: '2026-01-01T00:00:00Z',
            replies: [],
          },
        ]),
      ),
    )
    // A fresh mount (unmount + render) is a faithful "reload" simulation —
    // a real browser reload starts an entirely new app/query-cache instance.
    const { container } = renderEditor()

    await waitFor(() => {
      expect(container.querySelector('[data-clip-block]')?.className).toContain('underline')
    })
    // The clip's own border+tint channel is unaffected by the comment.
    expect(container.querySelector('[data-clip-block]')?.className).toContain('border-teal-300')
  })
})
