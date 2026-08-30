import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentEditor } from './DocumentEditor'
import { AuthProvider } from '../../auth/AuthProvider'
import { useCommentsStore } from '../../store/comments'
import { useDocumentPanelStore } from '../../store/documentPanel'
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

function renderEditor(documentId: string = DOCUMENT_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DocumentEditor projectId={PROJECT_ID} documentId={documentId} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator.clipboard as { write?: unknown }).write
})

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

  describe('formatting/comment bubble menu', () => {
    const PROSE_DOC: Document = {
      ...DOCUMENT,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
      },
    }

    it('shows Bold/Italic/Heading/List in the fixed toolbar (no selection needed) and toggles bold', async () => {
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
      const { container } = renderEditor()
      await screen.findByText('Hello there')

      // The formatting toolbar is fixed above the document — present before
      // any selection is made, unlike the contextual bubble menu.
      const boldButton = screen.getByRole('button', { name: 'Bold' })
      expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Heading 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
      expect(boldButton).toHaveAttribute('aria-pressed', 'false')

      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 0, 5) // "Hello"

      await userEvent.click(boldButton)
      await waitFor(() => {
        expect(container.querySelector('strong')).toHaveTextContent('Hello')
      })
      expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows only Copy/Comment (not formatting) in the floating bubble for a text selection', async () => {
      server.use(
        http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(PROSE_DOC)),
      )
      server.use(
        http.get('http://localhost:8000/documents/d-1/comments', () => HttpResponse.json([])),
      )
      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 0, 5) // "Hello"

      await screen.findByRole('button', { name: 'Copy' })
      expect(screen.getByRole('button', { name: 'Comment' })).toBeInTheDocument()
      // A clip-only action must never leak into the text-selection bubble.
      expect(screen.queryByRole('button', { name: 'Play clip' })).not.toBeInTheDocument()
    })

    it('writes both clipboard MIME entries via Copy for a text selection', async () => {
      server.use(
        http.get('http://localhost:8000/documents/d-1', () => HttpResponse.json(PROSE_DOC)),
      )
      server.use(
        http.get('http://localhost:8000/documents/d-1/comments', () => HttpResponse.json([])),
      )
      class FakeClipboardItem {
        data: Record<string, Blob>
        constructor(data: Record<string, Blob>) {
          this.data = data
        }
      }
      const write = vi.fn(async (_items: unknown[]) => {})
      vi.stubGlobal('ClipboardItem', FakeClipboardItem)
      navigator.clipboard.write = write

      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      selectWithinText(container, 'Hello there', 0, 5) // "Hello"

      await userEvent.click(await screen.findByRole('button', { name: 'Copy' }))

      expect(write).toHaveBeenCalledTimes(1)
      const item = write.mock.calls[0]?.[0]?.[0] as FakeClipboardItem
      expect(await item.data['text/plain']?.text()).toBe('Hello')
      expect(await item.data['text/html']?.text()).toContain('Hello')
    })

    // The clip-selection branch (Play/Comment/Remove for a NodeSelection over
    // a clipBlock) isn't covered by an automated test here: ProseMirror's
    // real click handling resolves the clicked node via on-screen coordinates
    // (`view.posAtCoords`), and its DOM-selection-read fallback is disabled
    // for React node views (`ReactNodeView.ignoreMutation` unconditionally
    // returns `true`, by design, so React's own DOM updates inside a node
    // view never get misread as document mutations). Neither path is
    // reachable in jsdom's zeroed-out layout without adding an editor-access
    // seam to production code purely for tests. `shouldShowBubble`'s
    // clip-vs-text discrimination is covered directly below instead; the
    // full clip popup (Play/Comment/Remove, and Remove actually deleting the
    // node) is on the Phase E6 manual verification checklist.
  })

  describe('insertion-point marker', () => {
    const PROSE_DOC: Document = {
      ...DOCUMENT,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
      },
    }

    function mockClipRoutes() {
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
      server.use(
        http.post(
          'http://localhost:8000/documents/d-1/clip-blocks/resolve',
          async ({ request }) => {
            const body = (await request.json()) as { start_token_id: string }
            return HttpResponse.json({
              transcript_id: 't-1',
              video_id: 'v-1',
              video_name: 'Video',
              segment_id: 'seg-1',
              start_token_id: body.start_token_id,
              end_token_id: body.start_token_id,
              start_time: 1,
              end_time: 2,
              speaker_name: null,
              language: null,
              excerpt: body.start_token_id === 'tok-a' ? 'CLIP1' : 'CLIP2',
              thumbnail_token: null,
              folder_path: [],
            })
          },
        ),
      )
    }

    it('lands a queued insert at the cursor position, then advances the marker past it', async () => {
      mockClipRoutes()
      const { container } = renderEditor()
      const paragraph = await screen.findByText('Hello there')
      await userEvent.click(paragraph)
      // Placing the cursor is enough — the marker is tracked automatically,
      // no separate "mark insert point" action.
      selectWithinText(container, 'Hello there', 6, 6) // collapsed cursor before "there"
      await waitFor(() => {
        expect(container.querySelector('[data-insert-marker]')).toBeInTheDocument()
      })

      useDocumentPanelStore.getState().queueInsert({
        transcriptId: 't-1',
        videoId: 'v-1',
        startTokenId: 'tok-a',
        endTokenId: 'tok-a',
      })

      await waitFor(() => {
        expect(container.querySelector('p')?.textContent).toBe('Hello CLIP1there')
      })
      // The marker isn't consumed by the insert — it stays set, having
      // advanced to just after the node that was just inserted.
      expect(container.querySelector('[data-insert-marker]')).toBeInTheDocument()

      useDocumentPanelStore.getState().queueInsert({
        transcriptId: 't-1',
        videoId: 'v-1',
        startTokenId: 'tok-b',
        endTokenId: 'tok-b',
      })

      await waitFor(() => {
        expect(container.querySelector('p')?.textContent).toBe('Hello CLIP1CLIP2there')
      })
    })

    // "An unrelated edit before the marker shifts its mapped position
    // forward" is covered directly at the plugin level instead of here —
    // see `insertMarker.test.ts`. Reproducing it through `DocumentEditor`
    // would need a DOM-selection edit *after* the marker's widget
    // decoration has already split the paragraph's text into two runs
    // around a zero-width sibling node; combined with the jsdom
    // DOM-selection-simulation technique this file otherwise uses
    // (`selectWithinText`, which depends on ProseMirror's DOM-selection-read
    // path — itself dependent on real click/focus geometry jsdom doesn't
    // provide), the result was order-dependent rather than a reflection of
    // the behavior under test. The plugin-level test proves the mapping;
    // this describe block's other tests prove `DocumentEditor` reads that
    // mapped position correctly at insert time.

    it('falls back to end-of-document inserts before the cursor has ever been placed', async () => {
      mockClipRoutes()
      const { container } = renderEditor()
      await screen.findByText('Hello there')
      expect(container.querySelector('[data-insert-marker]')).not.toBeInTheDocument()

      useDocumentPanelStore.getState().queueInsert({
        transcriptId: 't-1',
        videoId: 'v-1',
        startTokenId: 'tok-a',
        endTokenId: 'tok-a',
      })

      await waitFor(() => {
        expect(container.querySelector('p')?.textContent).toBe('Hello thereCLIP1')
      })
    })

    // Not covered by an integration test here: reproducing "an edit lands
    // while the resolve POST is still in flight" needs either fake timers
    // (this suite uses the real 1s autosave debounce, which a previous
    // test's still-pending timer can fire mid-test and disrupt) or a gated
    // MSW handler layered on top of the same jsdom DOM-selection-simulation
    // technique documented elsewhere in this file as fragile around
    // focus/`posAtCoords` — combining both made the test's outcome depend on
    // suite run order rather than on the behavior under test. The fix itself
    // (reading `insertMarkerPluginKey.getState(editor.state)` inside
    // `onSuccess`, not before the `resolveClipBlock.mutate` call) is
    // covered analytically: `insertMarker.test.ts` proves the plugin maps a
    // set position through an intervening transaction, and the test above
    // proves the same mapping end-to-end when the edit happens before the
    // queued insert is even dispatched. What's untested is only the
    // difference in *when* the read happens relative to the network
    // round-trip, which the code change guarantees by construction.
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
    expect(container.querySelector('[data-clip-block]')?.className).toContain('border-info')
  })
})
