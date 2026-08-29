import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('renders each item as a link except the last, which is plain text', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          items={[
            { label: 'xochi', href: '/projects/1' },
            { label: 'Interviews', href: '/projects/1?folder=2' },
            { label: 'clip.mp4' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'xochi' })).toHaveAttribute('href', '/projects/1')
    expect(screen.getByRole('link', { name: 'Interviews' })).toHaveAttribute(
      'href',
      '/projects/1?folder=2',
    )
    expect(screen.queryByRole('link', { name: 'clip.mp4' })).not.toBeInTheDocument()
    expect(screen.getByText('clip.mp4')).toBeInTheDocument()
  })

  it('renders a project-only trail with no chevron', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'xochi' }]} />
      </MemoryRouter>,
    )
    expect(screen.getByText('xochi')).toBeInTheDocument()
  })
})
