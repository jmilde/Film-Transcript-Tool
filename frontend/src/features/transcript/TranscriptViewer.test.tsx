import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptViewer } from './TranscriptViewer'
import { usePlaybackStore } from '../../store/playback'
import { useSelectionStore } from '../../store/selection'
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
  render(
    <TranscriptViewer
      transcript={TRANSCRIPT}
      speakers={[SPEAKER]}
      isLoading={false}
      onSeekToken={vi.fn()}
      onPlaySelection={onPlaySelection}
    />,
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
    render(
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={onSeekToken}
        onPlaySelection={vi.fn()}
      />,
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
    render(
      <TranscriptViewer
        transcript={undefined}
        speakers={[]}
        isLoading={false}
        onSeekToken={vi.fn()}
        onPlaySelection={vi.fn()}
      />,
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
})
