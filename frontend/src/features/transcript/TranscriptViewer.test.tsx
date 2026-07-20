import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptViewer } from './TranscriptViewer'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
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
        },
        {
          id: 'tok-b',
          segment_id: 'seg-1',
          original_text: 'world',
          edited_text: null,
          text: 'world',
          start_time: 1,
          end_time: 2,
        },
        {
          id: 'tok-c',
          segment_id: 'seg-1',
          original_text: 'again',
          edited_text: null,
          text: 'again',
          start_time: 2,
          end_time: 3,
        },
      ],
    },
  ],
}

beforeEach(() => {
  usePlaybackStore.getState().reset()
  usePlaybackStore.setState({ autoFollow: true })
  useSelectionStore.getState().clear()
})

function renderViewer(onPlaySelection = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={vi.fn()}
        onPlaySelection={onPlaySelection}
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

    await userEvent.click(screen.getByText('Play selection'))
    expect(onPlaySelection).toHaveBeenCalledWith(0, 2)
  })

  it('copies the selected text to the clipboard', async () => {
    renderViewer()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)

    await userEvent.click(screen.getByText('Copy'))
    expect(writeText).toHaveBeenCalledWith('Hello world')
  })

  it('clears the selection', async () => {
    renderViewer()

    fireEvent.mouseDown(screen.getByText('Hello'))
    fireEvent.mouseEnter(screen.getByText('world'))
    fireEvent.mouseUp(document)
    expect(screen.getByText('"Hello world"')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Clear selection'))
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

    await waitFor(() => expect(body).toEqual({ edited_text: 'earth' }))
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

    await waitFor(() => expect(body).toEqual({ edited_text: 'earth' }))
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

    await waitFor(() => expect(body).toEqual({ tokens: [{ text: 'He' }, { text: 'llo' }] }))
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

    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(deleted.sort()).toEqual(['tok-a', 'tok-b']))
  })

  it('merges the selection via the Merge button', async () => {
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

    await userEvent.click(screen.getByText('Merge'))
    const mergeInput = screen.getByDisplayValue('Hello world')
    fireEvent.change(mergeInput, { target: { value: "don't" } })
    await userEvent.click(screen.getByText('Confirm'))

    await waitFor(() => expect(body).toEqual({ token_ids: ['tok-a', 'tok-b'], text: "don't" }))
  })
})
