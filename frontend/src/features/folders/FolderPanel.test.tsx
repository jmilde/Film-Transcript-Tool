import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import { useUploadQueueStore } from '../../store/uploadQueue'
import { FolderPanel } from './FolderPanel'

const FOLDER_ID = '00000000-0000-0000-0000-0000000000f1'
const SUBFOLDER_ID = '00000000-0000-0000-0000-0000000000f2'

function makeFile(name: string): File {
  return new File(['x'], name)
}

function fileEntry(file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (success: (f: File) => void) => success(file),
  } as unknown as FileSystemFileEntry
}

function directoryEntry(entries: FileSystemEntry[]): FileSystemDirectoryEntry {
  let read = false
  return {
    isFile: false,
    isDirectory: true,
    name: 'dir',
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        if (read) {
          success([])
        } else {
          read = true
          success(entries)
        }
      },
    }),
  } as unknown as FileSystemDirectoryEntry
}

function fileDataTransferItem(file: File): DataTransferItem {
  return {
    kind: 'file',
    webkitGetAsEntry: () => fileEntry(file),
    getAsFile: () => file,
  } as unknown as DataTransferItem
}

function directoryDataTransferItem(entries: FileSystemEntry[]): DataTransferItem {
  return {
    kind: 'file',
    webkitGetAsEntry: () => directoryEntry(entries),
    getAsFile: () => null,
  } as unknown as DataTransferItem
}

function renderFolderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/', element: <FolderPanel folderId={FOLDER_ID} onSelectFolder={() => {}} /> }])
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function mockFolderContents() {
  server.use(
    http.get(`http://localhost:8000/folders/${FOLDER_ID}`, () =>
      HttpResponse.json({
        folder: { id: FOLDER_ID, project_id: 'p-1', parent_folder_id: null, name: 'Footage' },
        folders: [{ id: SUBFOLDER_ID, name: 'Day 1' }],
        videos: [{ id: 'v-1', name: 'Existing clip' }],
      }),
    ),
  )
}

beforeEach(() => {
  useUploadQueueStore.setState({ entries: [], files: {} })
  mockFolderContents()
})

describe('FolderPanel OS file drop', () => {
  it('enqueues dropped video files into the upload queue for this folder', async () => {
    renderFolderPanel()
    await screen.findByText('Existing clip')

    const list = screen.getByRole('list')
    fireEvent.drop(list, {
      dataTransfer: {
        types: ['Files'],
        items: [fileDataTransferItem(makeFile('clip.mp4'))],
      },
    })

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries).toHaveLength(1)
    })
    const entry = useUploadQueueStore.getState().entries[0]
    expect(entry?.fileName).toBe('clip.mp4')
    expect(entry?.folderId).toBe(FOLDER_ID)
    expect(entry?.status).toBe('queued')
  })

  it('recursively walks a dropped OS folder via webkitGetAsEntry and filters to video files', async () => {
    renderFolderPanel()
    await screen.findByText('Existing clip')

    const list = screen.getByRole('list')
    const nested = directoryEntry([fileEntry(makeFile('nested.mov'))])
    const top = directoryDataTransferItem([fileEntry(makeFile('top.mp4')), nested])
    fireEvent.drop(list, {
      dataTransfer: { types: ['Files'], items: [top] },
    })

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries).toHaveLength(2)
    })
    const names = useUploadQueueStore
      .getState()
      .entries.map((e) => e.fileName)
      .sort()
    expect(names).toEqual(['nested.mov', 'top.mp4'])
  })

  it('filters out non-video files before enqueueing', async () => {
    renderFolderPanel()
    await screen.findByText('Existing clip')

    const list = screen.getByRole('list')
    fireEvent.drop(list, {
      dataTransfer: {
        types: ['Files'],
        items: [
          fileDataTransferItem(makeFile('clip.mp4')),
          fileDataTransferItem(makeFile('notes.txt')),
        ],
      },
    })

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries).toHaveLength(1)
    })
    expect(useUploadQueueStore.getState().entries[0]?.fileName).toBe('clip.mp4')
  })

  it('does not enqueue anything for a plain internal video-move drag', async () => {
    renderFolderPanel()
    await screen.findByText('Existing clip')

    const list = screen.getByRole('list')
    fireEvent.drop(list, {
      dataTransfer: {
        types: ['application/x-video-ids'],
        getData: () => '',
      },
    })

    expect(useUploadQueueStore.getState().entries).toHaveLength(0)
  })
})

describe('FolderPanel select-folder button', () => {
  it('enqueues only video files selected via the folder picker', async () => {
    renderFolderPanel()
    await screen.findByText('Existing clip')
    const user = userEvent.setup()

    const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.webkitdirectory).toBe(true)

    await user.upload(input, [makeFile('a.mp4'), makeFile('skip.jpg')])

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries).toHaveLength(1)
    })
    expect(useUploadQueueStore.getState().entries[0]?.fileName).toBe('a.mp4')
  })
})
