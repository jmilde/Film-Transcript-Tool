import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { useUploadQueueStore, type UploadEntry } from '../store/uploadQueue'
import { UploadTray } from './UploadTray'

function renderTray() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UploadTray />
    </QueryClientProvider>,
  )
}

function seed(entries: UploadEntry[]) {
  useUploadQueueStore.setState({ entries, files: {} })
}

beforeEach(() => {
  useUploadQueueStore.setState({ entries: [], files: {} })
  server.use(http.get('http://localhost:8000/videos/status', () => HttpResponse.json([])))
})

describe('UploadTray', () => {
  it('renders nothing when the queue is empty', () => {
    const { container } = renderTray()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one row per entry with its status label', () => {
    seed([
      { localId: 'a', folderId: 'f-1', fileName: 'a.mp4', fileSize: 1, status: 'uploading' },
      { localId: 'b', folderId: 'f-1', fileName: 'b.mp4', fileSize: 2, status: 'ready' },
      {
        localId: 'c',
        folderId: 'f-1',
        fileName: 'c.mp4',
        fileSize: 3,
        status: 'failed',
        error: 'oops',
      },
    ])

    renderTray()

    expect(screen.getByText('a.mp4')).toBeInTheDocument()
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(screen.getByText('b.mp4')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('c.mp4')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('dismiss removes just that entry', async () => {
    seed([
      { localId: 'a', folderId: 'f-1', fileName: 'a.mp4', fileSize: 1, status: 'ready' },
      { localId: 'b', folderId: 'f-1', fileName: 'b.mp4', fileSize: 2, status: 'ready' },
    ])
    renderTray()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Dismiss a.mp4' }))

    expect(useUploadQueueStore.getState().entries.map((e) => e.localId)).toEqual(['b'])
    expect(screen.queryByText('a.mp4')).not.toBeInTheDocument()
    expect(screen.getByText('b.mp4')).toBeInTheDocument()
  })

  it('"clear completed" removes only ready entries, leaving others', async () => {
    seed([
      { localId: 'a', folderId: 'f-1', fileName: 'a.mp4', fileSize: 1, status: 'ready' },
      { localId: 'b', folderId: 'f-1', fileName: 'b.mp4', fileSize: 2, status: 'failed' },
      { localId: 'c', folderId: 'f-1', fileName: 'c.mp4', fileSize: 3, status: 'queued' },
    ])
    renderTray()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Clear completed' }))

    await waitFor(() => {
      expect(
        useUploadQueueStore
          .getState()
          .entries.map((e) => e.localId)
          .sort(),
      ).toEqual(['b', 'c'])
    })
    expect(screen.queryByText('a.mp4')).not.toBeInTheDocument()
    expect(screen.getByText('b.mp4')).toBeInTheDocument()
    expect(screen.getByText('c.mp4')).toBeInTheDocument()
  })

  it('disables "clear completed" when nothing is ready', () => {
    seed([{ localId: 'a', folderId: 'f-1', fileName: 'a.mp4', fileSize: 1, status: 'uploading' }])
    renderTray()

    expect(screen.getByRole('button', { name: 'Clear completed' })).toBeDisabled()
  })
})
