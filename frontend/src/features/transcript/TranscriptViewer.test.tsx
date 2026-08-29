import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptViewer } from './TranscriptViewer'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
import { useDocumentPanelStore } from '../../store/documentPanel'
import { server } from '../../test/server'
import type { Speaker } from '../../api/hooks/useSpeakers'
import type { Transcript } from '../../api/hooks/useTranscripts'

const SPEAKER: Speaker = {
  id: 'spk-1',
  video_id: 'vid-1',
  provider_identifier: 'spk_0',
  name: 'Jordan',
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
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator.clipboard as { write?: unknown }).write
})

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

    expect(screen.getByText('Jordan')).toBeInTheDocument()
    expect(screen.getByText('world')).toHaveClass('bg-amber-200')
    expect(screen.getByText('Hello')).not.toHaveClass('bg-amber-200')
  })

  it('seeks the video on a plain click', () => {
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
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    fireEvent.mouseDown(screen.getByText('world'))
    fireEvent.mouseUp(document)
    expect(onSeekToken).toHaveBeenCalledWith(1)
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
    expect(screen.getByText('Hello')).toHaveClass('bg-sky-200')
    expect(screen.getByText('again')).toHaveClass('bg-sky-200')
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

  it('edits a token via double-click', async () => {
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

    fireEvent.dblClick(screen.getByText('world'))
    const input = screen.getByDisplayValue('world')
    fireEvent.change(input, { target: { value: 'earth' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(body).toEqual({ edited_text: 'earth', expected_version: 1 }))
  })

  it('escape cancels an in-progress edit without sending a request', () => {
    let called = false
    server.use(
      http.patch('http://localhost:8000/tokens/tok-b', () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    renderViewer()

    fireEvent.dblClick(screen.getByText('world'))
    const input = screen.getByDisplayValue('world')
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

    fireEvent.dblClick(screen.getByText('world'))
    const input = screen.getByDisplayValue('world')
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

    fireEvent.dblClick(screen.getByText('again'))
    const input = screen.getByDisplayValue('again')
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

    fireEvent.dblClick(screen.getByText('Hello'))
    const input = screen.getByDisplayValue('Hello')
    fireEvent.change(input, { target: { value: 'He llo' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(body).toEqual({
        tokens: [{ text: 'He' }, { text: 'llo' }],
        expected_version: 1,
      }),
    )
  })

  it('deletes the whole selection via the Delete button', async () => {
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

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleted.sort()).toEqual(['tok-a', 'tok-b']))
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

  it('underlines tokens covered by a comment, gray once resolved', () => {
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
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Hello')).toHaveClass('decoration-violet-400')
    expect(screen.getByText('again')).toHaveClass('decoration-slate-300')
    expect(screen.getByText('world')).not.toHaveClass('decoration-violet-400')
  })

  it('groups consecutive same-speaker segments under a single header', () => {
    const OTHER_SPEAKER: Speaker = {
      id: 'spk-2',
      video_id: 'vid-1',
      provider_identifier: 'spk_1',
      name: 'Alex',
      color: null,
    }
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
          canEdit={true}
          videoId="vid-1"
        />
      </QueryClientProvider>,
    )

    expect(screen.getAllByText('Jordan')).toHaveLength(1)
    expect(screen.getAllByText('Alex')).toHaveLength(1)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    expect(screen.getByText('again')).toBeInTheDocument()
  })

  it('searches within the transcript and steps through matches', async () => {
    renderViewer()

    await userEvent.click(screen.getByRole('button', { name: 'Search transcript' }))
    await userEvent.type(screen.getByPlaceholderText('Find in transcript…'), 'o')

    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toHaveClass('bg-orange-300')

    await userEvent.click(screen.getByRole('button', { name: 'Next match' }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByText('world')).toHaveClass('bg-orange-300')

    await userEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByPlaceholderText('Find in transcript…')).not.toBeInTheDocument()
  })

  describe('viewer role (canEdit=false)', () => {
    it('does not start an inline edit on double-click', () => {
      renderViewer(vi.fn(), false)

      fireEvent.dblClick(screen.getByText('world'))

      expect(screen.queryByDisplayValue('world')).not.toBeInTheDocument()
    })

    it('hides Edit, Comment, Add to Document, and Delete from the selection toolbar, keeping Play/Copy', () => {
      renderViewer(vi.fn(), false)

      fireEvent.mouseDown(screen.getByText('Hello'))
      fireEvent.mouseEnter(screen.getByText('world'))
      fireEvent.mouseUp(document)

      expect(screen.getByRole('button', { name: 'Play selection' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })
  })

  describe('token version conflicts (409)', () => {
    const CONFLICT_BODY = {
      error: { code: 'CONFLICT', message: 'This token was edited by someone else' },
    }
    const BANNER_TEXT = 'This was edited by someone else. Your change was not saved.'

    it('shows a conflict banner instead of silently retrying on a 409 edit conflict', async () => {
      server.use(
        http.patch('http://localhost:8000/tokens/tok-b', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewer()

      fireEvent.dblClick(screen.getByText('world'))
      const input = screen.getByDisplayValue('world')
      fireEvent.change(input, { target: { value: 'earth' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })

    it('dismisses the banner when "Reload" is clicked', async () => {
      server.use(
        http.patch('http://localhost:8000/tokens/tok-b', () =>
          HttpResponse.json(CONFLICT_BODY, { status: 409 }),
        ),
      )
      renderViewer()

      fireEvent.dblClick(screen.getByText('world'))
      const input = screen.getByDisplayValue('world')
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
      renderViewer()

      fireEvent.dblClick(screen.getByText('again'))
      const input = screen.getByDisplayValue('again')
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
      renderViewer()

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
      renderViewer()

      fireEvent.dblClick(screen.getByText('Hello'))
      const input = screen.getByDisplayValue('Hello')
      fireEvent.change(input, { target: { value: 'He llo' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    })
  })
})
