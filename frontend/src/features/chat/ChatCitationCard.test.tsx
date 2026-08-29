import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatCitationCard } from './ChatCitationCard'
import type { ChatCitation } from '../../api/hooks/useChat'

const CITATION: ChatCitation = {
  marker: 1,
  chunk_id: 'chunk-1',
  transcript_id: 't-1',
  video_id: 'v-1',
  video_name: 'Interview A',
  segment_id: 'seg-1',
  start_token_id: 'tok-a',
  end_token_id: 'tok-b',
  start_time: 12.5,
  end_time: 14,
  speaker_name: 'Jordan',
  language: 'en',
  excerpt: 'The keeper lit the lamp at dusk.',
  thumbnail_token: null,
  folder_path: ['Season 1'],
}

describe('ChatCitationCard', () => {
  it('seeks on click', async () => {
    const onClick = vi.fn()
    render(<ChatCitationCard citation={CITATION} onClick={onClick} />)

    await userEvent.click(screen.getByText('Interview A'))

    expect(onClick).toHaveBeenCalled()
  })

  it('does not offer Add to Document', () => {
    render(<ChatCitationCard citation={CITATION} onClick={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
  })
})
