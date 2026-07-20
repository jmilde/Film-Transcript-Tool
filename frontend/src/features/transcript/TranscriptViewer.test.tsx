import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptViewer } from './TranscriptViewer'
import { usePlaybackStore } from '../../store/playback'
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
      ],
    },
  ],
}

beforeEach(() => {
  usePlaybackStore.getState().reset()
  usePlaybackStore.setState({ autoFollow: true })
})

describe('TranscriptViewer', () => {
  it('highlights the token matching the current playback time', () => {
    usePlaybackStore.setState({ currentTime: 1.5 })
    render(
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={() => {}}
      />,
    )

    expect(screen.getByText('Jordan')).toBeInTheDocument()
    expect(screen.getByText('world')).toHaveClass('bg-amber-200')
    expect(screen.getByText('Hello')).not.toHaveClass('bg-amber-200')
  })

  it('seeks the video when a token is clicked', async () => {
    const onSeekToken = vi.fn()
    render(
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={onSeekToken}
      />,
    )

    await userEvent.click(screen.getByText('world'))
    expect(onSeekToken).toHaveBeenCalledWith(1)
  })

  it('toggles auto-follow', async () => {
    render(
      <TranscriptViewer
        transcript={TRANSCRIPT}
        speakers={[SPEAKER]}
        isLoading={false}
        onSeekToken={() => {}}
      />,
    )

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
        onSeekToken={() => {}}
      />,
    )
    expect(screen.getByText('No transcript available yet.')).toBeInTheDocument()
  })
})
