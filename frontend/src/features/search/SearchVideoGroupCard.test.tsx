import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchVideoGroupCard } from './SearchVideoGroupCard'
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

describe('SearchVideoGroupCard', () => {
  it('seeks on selecting a hit', async () => {
    const onSelectHit = vi.fn()
    render(<SearchVideoGroupCard group={GROUP} onSelectHit={onSelectHit} />)

    await userEvent.click(screen.getByText('hello there'))

    expect(onSelectHit).toHaveBeenCalledWith(GROUP.hits[0])
  })

  it('does not offer Add to Document for any hit', () => {
    render(<SearchVideoGroupCard group={GROUP} onSelectHit={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Add to Document' })).not.toBeInTheDocument()
  })
})
