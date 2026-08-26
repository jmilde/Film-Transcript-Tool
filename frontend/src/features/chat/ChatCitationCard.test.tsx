import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatCitationCard } from './ChatCitationCard'
import { useDocumentPanelStore } from '../../store/documentPanel'
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

beforeEach(() => {
  useDocumentPanelStore.setState({ isOpen: false, pendingInsert: null })
})

describe('ChatCitationCard', () => {
  it('queues a clip insert without triggering the seek action', async () => {
    const onClick = vi.fn()
    render(<ChatCitationCard citation={CITATION} onClick={onClick} canEdit />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to Document' }))

    expect(useDocumentPanelStore.getState().pendingInsert).toEqual({
      transcriptId: 't-1',
      videoId: 'v-1',
      startTokenId: 'tok-a',
      endTokenId: 'tok-b',
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('still seeks on the main card click', async () => {
    const onClick = vi.fn()
    render(<ChatCitationCard citation={CITATION} onClick={onClick} canEdit />)

    await userEvent.click(screen.getByText('Interview A'))

    expect(onClick).toHaveBeenCalled()
  })

  it('does not offer Add to Document for a viewer', () => {
    render(<ChatCitationCard citation={CITATION} onClick={vi.fn()} canEdit={false} />)

    expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
  })
})
