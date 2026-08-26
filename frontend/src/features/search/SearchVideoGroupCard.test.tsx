import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchVideoGroupCard } from './SearchVideoGroupCard'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { SearchVideoGroup } from '../../api/hooks/useSearch'

const GROUP: SearchVideoGroup = {
  video_id: 'v-1',
  video_name: 'Interview A',
  folder_path: [],
  thumbnail_token: null,
  hit_count: 2,
  hits: [
    {
      kind: 'transcript',
      id: 'tok-a',
      transcript_id: 't-1',
      text: 'hello there',
      start_time: 1,
      rank: 1,
    },
    {
      kind: 'speaker',
      id: 'spk-1',
      transcript_id: null,
      text: 'Jordan',
      start_time: null,
      rank: 0.5,
    },
  ],
}

beforeEach(() => {
  useDocumentPanelStore.setState({ isOpen: false, pendingInsert: null })
})

describe('SearchVideoGroupCard', () => {
  it('queues a single-token clip insert for a transcript hit, without seeking', async () => {
    const onSelectHit = vi.fn()
    render(<SearchVideoGroupCard group={GROUP} onSelectHit={onSelectHit} canEdit />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to Document' }))

    expect(useDocumentPanelStore.getState().pendingInsert).toEqual({
      transcriptId: 't-1',
      videoId: 'v-1',
      startTokenId: 'tok-a',
      endTokenId: 'tok-a',
    })
    expect(onSelectHit).not.toHaveBeenCalled()
  })

  it('does not offer Add to Document for a speaker hit (no token to anchor to)', () => {
    render(<SearchVideoGroupCard group={GROUP} onSelectHit={vi.fn()} canEdit />)

    expect(screen.getAllByRole('button', { name: 'Add to Document' })).toHaveLength(1)
  })

  it('does not offer Add to Document for a viewer', () => {
    render(<SearchVideoGroupCard group={GROUP} onSelectHit={vi.fn()} canEdit={false} />)

    expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
  })
})
