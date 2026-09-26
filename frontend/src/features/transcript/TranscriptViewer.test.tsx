import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptViewer } from './TranscriptViewer'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { useCommentsStore } from '../../store/comments'
import { server } from '../../test/server'
import type { Speaker } from '../../api/hooks/useSpeakers'
import { useTranscript } from '../../api/hooks/useTranscripts'
import type { Transcript } from '../../api/hooks/useTranscripts'

const SPEAKER: Speaker = {
  id: 'spk-1',
  video_id: 'vid-1',
  provider_identifier: 'spk_0',
  name: 'Jordan',
  color: null,
}

const OTHER_SPEAKER: Speaker = {
  id: 'spk-2',
  video_id: 'vid-1',
  provider_identifier: 'spk_1',
  name: 'Alex',
  color: null,
}

const TRANSCRIPT: Transcript = {
  id: 't-1',
  video_id: 'vid-1',
  language: 'en',
  type: 'original',
  created_at: '2026-01-01T00:00:00Z',
  segments: [
    {
      id: 'seg-1',
      speaker_id: 'spk-1',
      tokens: [
        {
          id: 'tok-a',
          segment_id: 'seg-1',
          original_text: 'Hello',
          edited_text: null,
          text: 'Hello',
          start_time: 0,
          end_time: 1,
          version: 1,
          is_highlighted: false,
        },
        {
          id: 'tok-b',
          segment_id: 'seg-1',
          original_text: 'world',
          edited_text: null,
          text: 'world',
          start_time: 1,
          end_time: 2,
          version: 1,
          is_highlighted: false,
        },
        {
          id: 'tok-c',
          segment_id: 'seg-1',
          original_text: 'again',
          edited_text: null,
          text: 'again',
          start_time: 2,
          end_time: 3,
          version: 1,
          is_highlighted: false,
        },
      ],
    },
  ],
}

beforeEach(() => {
  usePlaybackStore.getState().reset()
  usePlaybackStore.setState({ autoFollow: true })
  useSelectionStore.getState().clear()
  useDocumentPanelStore.setState({ isOpen: false, pendingInsert: null })
  useCommentsStore.setState({ selectedId: null, hoveredId: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator.clipboard as { write?: unknown }).write
})

/** Fires the mousedown/mouseup pair a plain click produces. The resulting
 * edit/seek is deferred (see TranscriptViewer's click-vs-double-click
 * handling), so callers await the result with `findBy*`/`waitFor` rather
 * than asserting synchronously right after. */
function clickToken(el: HTMLElement) {
  fireEvent.mouseDown(el)
  fireEvent.mouseUp(document)
}

/** Fires a realistic double-click sequence — two full click cycles plus the
 * browser's own `dblclick` event — so the first click's deferred single-click
 * action is actually exercised and cancelled, instead of only dispatching a
 * bare `dblclick` event with no preceding clicks. */
function doubleClickToken(el: HTMLElement) {
  clickToken(el)
  clickToken(el)
  fireEvent.dblClick(el)
}

function renderViewer(onPlaySelection = vi.fn(), canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={vi.fn()}
        onPlaySelection={onPlaySelection}
        onPlayFrom={vi.fn()}
        canEdit={canEdit}
        videoId="vid-1"
      />
    </QueryClientProvider>,
  )
}

describe('TranscriptViewer', () => {
  it('highlights the token matching the current playback time', () => {
    usePlaybackStore.setState({ currentTime: 1.5 })
    renderViewer()

    expect(screen.getAllByText('Jordan').length).toBeGreaterThan(0)
    expect(screen.getByText('world')).toHaveClass('bg-info-subtle')
    expect(screen.getByText('Hello')).not.toHaveClass('bg-info-subtle')
  })

  it('seeks the video on a plain click for a viewer', async () => {
    const onSeekToken = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={TRANSCRIPT}
          speakers={[SPEAKER]}
          isLoading={false}
          onSeekToken={onSeekToken}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={false}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    clickToken(screen.getByText('world'))
    await waitFor(() => expect(onSeekToken).toHaveBeenCalledWith(1))
  })

  it('plays from a token on double-click', () => {
    const onPlayFrom = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={TRANSCRIPT}
          speakers={[SPEAKER]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={onPlayFrom}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    doubleClickToken(screen.getByText('world'))
    expect(onPlayFrom).toHaveBeenCalledWith(1)
  })

  it('does not also open an inline edit after a double-click', async () => {
    renderViewer()

    doubleClickToken(screen.getByText('world'))

    // Give the first click's deferred edit action a chance to fire if it
    // weren't properly cancelled by the second click/dblclick.
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByDisplayValue('world')).not.toBeInTheDocument()
  })

  it('toggles auto-follow', async () => {
    renderViewer()

    const checkbox = screen.getByLabelText('Auto-follow')
    expect(checkbox).toBeChecked()
    await userEvent.click(checkbox)
    expect(usePlaybackStore.getState().autoFollow).toBe(false)
  })

  it('shows an empty state when there is no transcript', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={undefined}
          speakers={[]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )
    expect(screen.getByText('No transcript available yet.')).toBeInTheDocument()
  })

  it('drag-selects a token range and shows text + in/out timecodes', () => {
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseEnter(screen.getByText('again'))
    fireEvent.mouseUp(document)

    expect(screen.getByText('"Hello world again"')).toBeInTheDocument()
    expect(screen.getByText('0:00 – 0:03')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toHaveClass('bg-brand-subtle')
    expect(screen.getByText('again')).toHaveClass('bg-brand-subtle')
  })

  it('plays the selection when "Play selection" is clicked', async () => {
    const onPlaySelection = vi.fn()
    renderViewer(onPlaySelection)

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Play selection' }))
    expect(onPlaySelection).toHaveBeenCalledWith(0, 2)
  })

  it('copies the selected text to the clipboard', async () => {
    renderViewer()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Hello world')
  })

  it('also writes a clip marker HTML entry when the Clipboard write API is available', async () => {
    class FakeClipboardItem {
      data: Record<string, Blob>
      constructor(data: Record<string, Blob>) {
        this.data = data
      }
    }
    const write = vi.fn(async (_items: unknown[]) => {})
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    navigator.clipboard.write = write

    renderViewer()
    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(write).toHaveBeenCalledTimes(1)
    const item = write.mock.calls[0]?.[0]?.[0] as FakeClipboardItem
    expect(await item.data['text/plain']?.text()).toBe('Hello world')
    const html = await item.data['text/html']?.text()
    expect(html).toContain('data-clip-block')
    expect(html).toContain('transcriptId="t-1"')
    expect(html).toContain('videoId="vid-1"')
    expect(html).toContain('startTokenId="tok-a"')
    expect(html).toContain('endTokenId="tok-b"')
    expect(html).toContain('excerpt="Hello world"')
    expect(html).toContain('>Hello world<')
  })

  it('clears the selection', async () => {
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)
    expect(screen.getByText('"Hello world"')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText('"Hello world"')).not.toBeInTheDocument()
  })

  it('edits a token via a plain click (editor)', async () => {
    let body: unknown
    server.use(
      http.patch('http://localhost:8000/tokens/tok-b', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          id: 'tok-b',
          segment_id: 'seg-1',
          original_text: 'world',
          edited_text: 'earth',
          text: 'earth',
          start_time: 1,
          end_time: 2,
        })
      }),
    )
    renderViewer()

    clickToken(screen.getByText('world'))
    const input = await screen.findByDisplayValue('world')
    fireEvent.change(input, { target: { value: 'earth' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ edited_text: 'earth', expected_version: 1 }))
  })

  it('escape cancels an in-progress edit without sending a request', async () => {
    let called = false
    server.use(
      http.patch('http://localhost:8000/tokens/tok-b', () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    renderViewer()

    clickToken(screen.getByText('world'))
    const input = await screen.findByDisplayValue('world')
    fireEvent.change(input, { target: { value: 'earth' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.getByText('world')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('commits an in-progress edit on Ctrl/Cmd+S', async () => {
    let body: unknown
    server.use(
      http.patch('http://localhost:8000/tokens/tok-b', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          id: 'tok-b',
          segment_id: 'seg-1',
          original_text: 'world',
          edited_text: 'earth',
          text: 'earth',
          start_time: 1,
          end_time: 2,
        })
      }),
    )
    renderViewer()

    clickToken(screen.getByText('world'))
    const input = await screen.findByDisplayValue('world')
    fireEvent.change(input, { target: { value: 'earth' } })
    fireEvent.keyDown(document, { key: 's', metaKey: true })

    await waitFor(() => expect(body).toEqual({ edited_text: 'earth', expected_version: 1 }))
  })

  it('deletes a token by clearing its text', async () => {
    let requested = false
    server.use(
      http.delete('http://localhost:8000/tokens/tok-c', () => {
        requested = true
        return HttpResponse.json({
          id: 'tok-c',
          segment_id: 'seg-1',
          original_text: 'again',
          edited_text: null,
          text: 'again',
          start_time: 2,
          end_time: 3,
        })
      }),
    )
    renderViewer()

    clickToken(screen.getByText('again'))
    const input = await screen.findByDisplayValue('again')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(requested).toBe(true))
  })

  it('splits a token by typing a space', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost:8000/tokens/tok-a/split', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json([
          {
            id: 'tok-a1',
            segment_id: 'seg-1',
            original_text: 'He',
            edited_text: null,
            text: 'He',
            start_time: 0,
            end_time: 0.5,
          },
          {
            id: 'tok-a2',
            segment_id: 'seg-1',
            original_text: 'llo',
            edited_text: null,
            text: 'llo',
            start_time: 0.5,
            end_time: 1,
          },
        ])
      }),
    )
    renderViewer()

    clickToken(screen.getByText('Hello'))
    const input = await screen.findByDisplayValue('Hello')
    fireEvent.change(input, { target: { value: 'He llo' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(body).toEqual({
        tokens: [{ text: 'He' }, { text: 'llo' }],
        expected_version: 1,
      }),
    )
  })

  it('deletes the whole selection by clearing the Edit draft to empty', async () => {
    const deleted: string[] = []
    server.use(
      http.delete('http://localhost:8000/tokens/:tokenId', ({ params }) => {
        deleted.push(params.tokenId as string)
        return HttpResponse.json({})
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const mergeInput = screen.getByDisplayValue('Hello world')
    fireEvent.change(mergeInput, { target: { value: '' } })
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() => expect(deleted.sort()).toEqual(['tok-a', 'tok-b']))
  })

  it('deletes the whole selection on Backspace', async () => {
    const deleted: string[] = []
    server.use(
      http.delete('http://localhost:8000/tokens/:tokenId', ({ params }) => {
        deleted.push(params.tokenId as string)
        return HttpResponse.json({})
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    fireEvent.keyDown(document, { key: 'Backspace' })

    await waitFor(() => expect(deleted.sort()).toEqual(['tok-a', 'tok-b']))
  })

  it('does not delete on Backspace while a draft input is focused', async () => {
    let mergeCalled = false
    server.use(
      http.post('http://localhost:8000/tokens/merge', () => {
        mergeCalled = true
        return HttpResponse.json({})
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const mergeInput = screen.getByDisplayValue('Hello world')
    fireEvent.keyDown(mergeInput, { key: 'Backspace' })

    // The input itself should still be there (draft not dismissed) and no
    // deletion or merge was triggered by the keystroke.
    expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument()
    expect(mergeCalled).toBe(false)
  })

  it('shows Edit for a cross-segment selection but does not merge non-empty replacement text', async () => {
    let mergeCalled = false
    server.use(
      http.post('http://localhost:8000/tokens/merge', () => {
        mergeCalled = true
        return HttpResponse.json({})
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const crossSegmentTranscript: Transcript = {
      ...TRANSCRIPT,
      segments: [
        { id: 'seg-1', speaker_id: 'spk-1', tokens: [TRANSCRIPT.segments[0].tokens[0]] },
        {
          id: 'seg-2',
          speaker_id: 'spk-1',
          tokens: [{ ...TRANSCRIPT.segments[0].tokens[1], segment_id: 'seg-2' }],
        },
      ],
    }
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={crossSegmentTranscript}
          speakers={[SPEAKER]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const mergeInput = screen.getByDisplayValue('Hello world')
    fireEvent.change(mergeInput, { target: { value: "don't" } })
    await userEvent.click(screen.getByText('Confirm'))

    await new Promise((r) => setTimeout(r, 10))
    expect(mergeCalled).toBe(false)
    // The draft stays open since there's no valid destination for the merge.
    expect(screen.getByDisplayValue("don't")).toBeInTheDocument()
  })

  it('merges the selection via the Edit button', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost:8000/tokens/merge', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          id: 'tok-merged',
          segment_id: 'seg-1',
          original_text: "don't",
          edited_text: null,
          text: "don't",
          start_time: 0,
          end_time: 2,
        })
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const mergeInput = screen.getByDisplayValue('Hello world')
    fireEvent.change(mergeInput, { target: { value: "don't" } })
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() =>
      expect(body).toEqual({
        tokens: [
          { token_id: 'tok-a', expected_version: 1 },
          { token_id: 'tok-b', expected_version: 1 },
        ],
        text: "don't",
      }),
    )
  })

  it('sends a highlight request for each selected token via the toolbar', async () => {
    const requests: { tokenId: string; body: unknown }[] = []
    server.use(
      http.patch('http://localhost:8000/tokens/:tokenId/highlight', async ({ request, params }) => {
        const body = await request.json()
        requests.push({ tokenId: params.tokenId as string, body })
        return HttpResponse.json({
          id: params.tokenId,
          segment_id: 'seg-1',
          original_text: 'x',
          edited_text: null,
          text: 'x',
          start_time: 0,
          end_time: 1,
          version: 2,
          is_highlighted: (body as { is_highlighted: boolean }).is_highlighted,
        })
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Highlight' }))

    await waitFor(() =>
      expect(requests).toEqual([
        { tokenId: 'tok-a', body: { is_highlighted: true, expected_version: 1 } },
        { tokenId: 'tok-b', body: { is_highlighted: true, expected_version: 1 } },
      ]),
    )
  })

  it('shows a pastel-orange background for already-highlighted tokens, and offers to remove it', async () => {
    // Past every token's range so none is the "active/playing" token — that
    // state outranks highlight in the bg cascade and would otherwise mask it.
    usePlaybackStore.setState({ currentTime: 10 })
    const highlightedTranscript: Transcript = {
      ...TRANSCRIPT,
      segments: [
        {
          ...TRANSCRIPT.segments[0],
          tokens: TRANSCRIPT.segments[0].tokens.map((t) =>
            t.id === 'tok-a' || t.id === 'tok-b' ? { ...t, is_highlighted: true } : t,
          ),
        },
      ],
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={highlightedTranscript}
          speakers={[SPEAKER]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Hello')).toHaveClass('bg-highlight-subtle')
    expect(screen.getByText('again')).not.toHaveClass('bg-highlight-subtle')

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)
    expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeInTheDocument()
  })

  it('creates a comment for the selection via the Comment button', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost:8000/transcripts/t-1/comments', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          id: 'c-1',
          transcript_id: 't-1',
          created_by: 'user-a',
          text: 'Check this',
          resolved: false,
          start_token_id: 'tok-a',
          end_token_id: 'tok-b',
          in_time: 0,
          out_time: 2,
          created_at: '2026-01-01T00:00:00Z',
          replies: [],
        })
      }),
    )
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    const commentInput = screen.getByRole('textbox')
    fireEvent.change(commentInput, { target: { value: 'Check this' } })
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() =>
      expect(body).toEqual({ start_token_id: 'tok-a', end_token_id: 'tok-b', text: 'Check this' }),
    )
  })

  it('queues a clip insert for the selection via the Add to Document button', async () => {
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByRole('button', { name: 'Add to Document' }))

    expect(useDocumentPanelStore.getState().pendingInsert).toEqual({
      transcriptId: 't-1',
      videoId: 'vid-1',
      startTokenId: 'tok-a',
      endTokenId: 'tok-b',
    })
    expect(useDocumentPanelStore.getState().isOpen).toBe(true)
    expect(useSelectionStore.getState().range).toBeNull()
  })

  it('underlines tokens covered by a comment, success-colored once resolved', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={TRANSCRIPT}
          speakers={[SPEAKER]}
          comments={[
            {
              id: 'c-1',
              created_by: 'user-a',
              text: 'note',
              resolved: false,
              anchor: {
                kind: 'transcript',
                transcript_id: 't-1',
                start_token_id: 'tok-a',
                end_token_id: 'tok-a',
                in_time: 0,
                out_time: 1,
              },
              created_at: '2026-01-01T00:00:00Z',
              replies: [],
            },
            {
              id: 'c-2',
              created_by: 'user-a',
              text: 'done',
              resolved: true,
              anchor: {
                kind: 'transcript',
                transcript_id: 't-1',
                start_token_id: 'tok-c',
                end_token_id: 'tok-c',
                in_time: 2,
                out_time: 3,
              },
              created_at: '2026-01-01T00:00:00Z',
              replies: [],
            },
          ]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Hello')).toHaveClass('decoration-warning')
    expect(screen.getByText('again')).toHaveClass('decoration-success')
    expect(screen.getByText('world')).not.toHaveClass('decoration-warning')
  })

  it('selects the comment covering a clicked token, and clears it for a plain token', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={TRANSCRIPT}
          speakers={[SPEAKER]}
          comments={[
            {
              id: 'c-1',
              created_by: 'user-a',
              text: 'note',
              resolved: false,
              anchor: {
                kind: 'transcript',
                transcript_id: 't-1',
                start_token_id: 'tok-a',
                end_token_id: 'tok-a',
                in_time: 0,
                out_time: 1,
              },
              created_at: '2026-01-01T00:00:00Z',
              replies: [],
            },
          ]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    clickToken(screen.getByText('Hello'))
    await waitFor(() => expect(useCommentsStore.getState().selectedId).toBe('c-1'))

    clickToken(screen.getByText('world'))
    await waitFor(() => expect(useCommentsStore.getState().selectedId).toBeNull())
  })

  it('groups consecutive same-speaker segments under a single header', () => {
    const transcript: Transcript = {
      ...TRANSCRIPT,
      segments: [
        {
          id: 'seg-1',
          speaker_id: 'spk-1',
          tokens: [TRANSCRIPT.segments[0].tokens[0]],
        },
        {
          id: 'seg-2',
          speaker_id: 'spk-1',
          tokens: [TRANSCRIPT.segments[0].tokens[1]],
        },
        {
          id: 'seg-3',
          speaker_id: 'spk-2',
          tokens: [TRANSCRIPT.segments[0].tokens[2]],
        },
      ],
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={transcript}
          speakers={[SPEAKER, OTHER_SPEAKER]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    // One speaker picker per group (not per segment) proves the grouping
    // logic combined the two consecutive Jordan segments under one header.
    const speakerPickers = screen.getAllByRole('combobox', { name: 'Speaker' })
    expect(speakerPickers).toHaveLength(2)
    expect(speakerPickers[0]).toHaveTextContent('Jordan')
    expect(speakerPickers[1]).toHaveTextContent('Alex')
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(screen.getByText('again')).toBeInTheDocument()
  })

  it('reassigns a segment group to a different speaker via the picker', async () => {
    const requests: { segmentId: string; body: unknown }[] = []
    server.use(
      http.patch('http://localhost:8000/segments/:segmentId', async ({ request, params }) => {
        const body = await request.json()
        requests.push({ segmentId: params.segmentId as string, body })
        return HttpResponse.json({
          id: params.segmentId,
          speaker_id: (body as { speaker_id: string }).speaker_id,
        })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranscriptViewer
          transcript={TRANSCRIPT}
          speakers={[SPEAKER, OTHER_SPEAKER]}
          isLoading={false}
          onSeekToken={vi.fn()}
          onPlaySelection={vi.fn()}
          onPlayFrom={vi.fn()}
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Speaker' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Alex' }))

    await waitFor(() =>
      expect(requests).toEqual([{ segmentId: 'seg-1', body: { speaker_id: 'spk-2' } }]),
    )
  })

  it('searches within the transcript and steps through matches', async () => {
    renderViewer()

    await userEvent.click(screen.getByRole('button', { name: 'Search transcript' }))
    await userEvent.type(screen.getByPlaceholderText('Find in transcript…'), 'o')

    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toHaveClass('bg-warning')

    await userEvent.click(screen.getByRole('button', { name: 'Next match' }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByText('world')).toHaveClass('bg-warning')

    await userEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByPlaceholderText('Find in transcript…')).not.toBeInTheDocument()
  })

  describe('viewer role (canEdit=false)', () => {
    it('double-click plays from that point rather than editing', async () => {
      const onPlayFrom = vi.fn()
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <TranscriptViewer
            transcript={TRANSCRIPT}
            speakers={[SPEAKER]}
            isLoading={false}
            onSeekToken={vi.fn()}
            onPlaySelection={vi.fn()}
            onPlayFrom={onPlayFrom}
            canEdit={false}
            videoId="vid-1"
          />
        </QueryClientProvider>,
      )

      doubleClickToken(screen.getByText('world'))

      expect(onPlayFrom).toHaveBeenCalledWith(1)
      await new Promise((r) => setTimeout(r, 300))
      expect(screen.queryByDisplayValue('world')).not.toBeInTheDocument()
    })

    it('hides Edit, Comment, and Add to Document from the selection toolbar, keeping Play/Copy', () => {
      renderViewer(vi.fn(), false)

      fireEvent.mouseDown(screen.getByText('Hello'))
      fireEvent.mouseEnter(screen.getByText('world'))
      fireEvent.mouseUp(document)

      expect(screen.getByRole('button', { name: 'Play selection' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
    })
  })

  describe('token version conflicts (409)', () => {
    const CONFLICT_BODY = {
      error: { code: 'CONFLICT', message: 'This token was edited by someone else' },
    }
    const BANNER_TEXT = 'This was edited by someone else. Your change was not saved.'

    // Every mutation's `onSettled` now always triggers a background
    // `invalidateQueries` (see useTokens.ts), and on a conflict resets that
    // mutation's error once the refetch it kicked off resolves — otherwise a
    // single stale conflict left the banner up indefinitely across every
    // later, unrelated action. `invalidateQueries` only actually refetches
    // when a query has an active observer, and `TranscriptViewer`'s real
    // parent (`VideoWorkspace`) always has one via `useTranscript` — plain
    // `renderViewer()` doesn't, so mount one here too.
    //
    // The resync-triggered GET is gated on a deferred the test resolves
    // explicitly, rather than a timer, so "the banner is still up" and "the
    // banner just cleared" are both asserted deterministically instead of
    // racing a delay against `findByText`'s polling under CI/parallel load.
    function renderViewerLive() {
      let getCalls = 0
      let resolveResync = () => {}
      const resyncGate = new Promise<void>((resolve) => {
        resolveResync = resolve
      })
      server.use(
        http.get('http://localhost:8000/transcripts/t-1', async () => {
          getCalls += 1
          if (getCalls > 1) await resyncGate
          return HttpResponse.json(TRANSCRIPT)
        }),
      )
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      function Wrapper() {
        useTranscript('t-1')
        return (
          <TranscriptViewer
            transcript={TRANSCRIPT}
            speakers={[SPEAKER]}
            isLoading={false}
            onSeekToken={vi.fn()}
            onPlaySelection={vi.fn()}
            onPlayFrom={vi.fn()}
            canEdit={true}
            videoId="vid-1"
          />
        )
      }
      render(
        <QueryClientProvider client={client}>
          <Wrapper />
        </QueryClientProvider>,
      )
      return { resolveResync }
    }

    it('shows a conflict banner instead of silently retrying on a 409 edit conflict', async () => {
      server.use(
        http.patch('http://localhost:8000/tokens/tok-b', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      // Resync deliberately left unresolved: the banner must be observable
      // while the background refetch is still in flight, not just in the
      // instant before it starts.
      renderViewerLive()

      clickToken(screen.getByText('world'))
      const input = await screen.findByDisplayValue('world')
      fireEvent.change(input, { target: { value: 'earth' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })

    it('clears the banner on its own once the background resync completes, with no manual Reload', async () => {
      server.use(
        http.patch('http://localhost:8000/tokens/tok-b', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      const { resolveResync } = renderViewerLive()

      clickToken(screen.getByText('world'))
      const input = await screen.findByDisplayValue('world')
      fireEvent.change(input, { target: { value: 'earth' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await screen.findByText(BANNER_TEXT)

      // A version conflict means the cached copy was stale by definition, so
      // the background resync it triggers resolves the conflict on its own —
      // this used to require a manual "Reload" click and would otherwise keep
      // the banner up indefinitely across every later, unrelated action.
      resolveResync()
      await waitFor(() => expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
    })

    it('dismisses the banner when "Reload" is clicked', async () => {
      server.use(
        http.patch('http://localhost:8000/tokens/tok-b', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewerLive()

      clickToken(screen.getByText('world'))
      const input = await screen.findByDisplayValue('world')
      fireEvent.change(input, { target: { value: 'earth' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await screen.findByText(BANNER_TEXT)

      await userEvent.click(screen.getByRole('button', { name: 'Reload' }))

      await waitFor(() => expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument())
    })

    it('shows a conflict banner on a 409 delete conflict', async () => {
      server.use(
        http.delete('http://localhost:8000/tokens/tok-c', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewerLive()

      clickToken(screen.getByText('again'))
      const input = await screen.findByDisplayValue('again')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })

    it('shows a conflict banner on a 409 merge conflict', async () => {
      server.use(
        http.post('http://localhost:8000/tokens/merge', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewerLive()

      fireEvent.mouseDown(screen.getByText('Hello'))
      fireEvent.mouseEnter(screen.getByText('world'))
      fireEvent.mouseUp(document)
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      const mergeInput = screen.getByDisplayValue('Hello world')
      fireEvent.change(mergeInput, { target: { value: "don't" } })
      await userEvent.click(screen.getByText('Confirm'))

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })

    it('shows a conflict banner on a 409 split conflict', async () => {
      server.use(
        http.post('http://localhost:8000/tokens/tok-a/split', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewerLive()

      clickToken(screen.getByText('Hello'))
      const input = await screen.findByDisplayValue('Hello')
      fireEvent.change(input, { target: { value: 'He llo' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })

    it('does not show the conflict banner on a 409 highlight conflict, and recovers the token', async () => {
      let call = 0
      server.use(
        http.patch('http://localhost:8000/tokens/:tokenId/highlight', ({ params }) => {
          call += 1
          // Both selected tokens' first PATCH conflicts; any later attempt
          // on either succeeds — mirrors "the earlier action already landed
          // server-side, a same-tick retry is what raced it".
          if (call <= 2) return HttpResponse.json(CONFLICT_BODY, { status: 409 })
          return HttpResponse.json({
            ...TRANSCRIPT.segments[0].tokens[0],
            id: params.tokenId,
            version: 2,
          })
        }),
        http.get('http://localhost:8000/transcripts/t-1', () => HttpResponse.json(TRANSCRIPT)),
      )
      renderViewer()

      fireEvent.mouseDown(screen.getByText('Hello'))
      fireEvent.mouseEnter(screen.getByText('world'))
      fireEvent.mouseUp(document)
      await userEvent.click(screen.getByRole('button', { name: 'Highlight' }))

      await waitFor(() => expect(call).toBe(2))
      expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()

      // A later highlight attempt on the same tokens isn't permanently
      // blocked by the earlier conflict — unlike edit/delete/merge/split,
      // there's no manual "Reload" needed to unstick it.
      fireEvent.mouseDown(screen.getByText('Hello'))
      fireEvent.mouseEnter(screen.getByText('world'))
      fireEvent.mouseUp(document)
      await userEvent.click(screen.getByRole('button', { name: 'Highlight' }))

      await waitFor(() => expect(call).toBe(4))
      expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
    })
  })
})
