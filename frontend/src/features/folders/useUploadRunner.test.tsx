import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { server } from '../../test/server'
import { useUploadQueueStore } from '../../store/uploadQueue'
import { useUploadRunner } from './useUploadRunner'

const FOLDER_ID = 'folder-1'

function makeFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name)
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mockDuplicateCheck(
  respond: (filename: string) => { is_duplicate: boolean } | Promise<unknown>,
) {
  server.use(
    http.get(
      `http://localhost:8000/folders/${FOLDER_ID}/videos/duplicate-check`,
      async ({ request }) => {
        const filename = new URL(request.url).searchParams.get('filename') as string
        const result = respond(filename)
        const body = result instanceof Promise ? await result : result
        return HttpResponse.json(body ?? { is_duplicate: false, video_id: null })
      },
    ),
  )
}

function mockUpload(
  respond: (filename: string) => { video_id: string; processing_job_id: string } | 'error',
) {
  server.use(
    http.post(`http://localhost:8000/folders/${FOLDER_ID}/videos`, async ({ request }) => {
      const form = await request.formData()
      const file = form.get('file') as File
      const result = respond(file.name)
      if (result === 'error') {
        return HttpResponse.json(
          { error: { code: 'BAD_REQUEST', message: 'nope' } },
          { status: 400 },
        )
      }
      return HttpResponse.json(result, { status: 201 })
    }),
  )
}

function mockBatchStatus(handler: (ids: string[]) => unknown[]) {
  server.use(
    http.get('http://localhost:8000/videos/status', ({ request }) => {
      const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(Boolean)
      return HttpResponse.json(handler(ids))
    }),
  )
}

beforeEach(() => {
  useUploadQueueStore.setState({ entries: [], files: {} })
})

describe('useUploadRunner concurrency', () => {
  it('never runs more than 3 entries in flight at once', async () => {
    const gates = new Map<string, ReturnType<typeof deferred<{ is_duplicate: boolean }>>>()
    mockDuplicateCheck((filename) => {
      const gate = deferred<{ is_duplicate: boolean }>()
      gates.set(filename, gate)
      return gate.promise
    })
    mockUpload((filename) => ({ video_id: `v-${filename}`, processing_job_id: `j-${filename}` }))
    mockBatchStatus(() => [])

    const files = Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.mp4`, 10 + i))
    useUploadQueueStore.getState().enqueue(files, FOLDER_ID)

    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      const checking = useUploadQueueStore.getState().entries.filter((e) => e.status === 'checking')
      expect(checking).toHaveLength(3)
    })
    expect(
      useUploadQueueStore.getState().entries.filter((e) => e.status === 'queued'),
    ).toHaveLength(2)
    // Exactly 3 duplicate-check calls were dispatched — the cap held the rest back.
    expect(gates.size).toBe(3)

    for (const gate of gates.values()) gate.resolve({ is_duplicate: false })

    // Releasing the first 3 frees capacity for the remaining 2 to start.
    await waitFor(() => expect(gates.size).toBe(5))
    for (const gate of gates.values()) gate.resolve({ is_duplicate: false })

    await waitFor(() => {
      const processing = useUploadQueueStore
        .getState()
        .entries.filter((e) => e.status === 'processing')
      expect(processing).toHaveLength(5)
    })
  })
})

describe('useUploadRunner status transitions', () => {
  it('marks a duplicate as skipped without uploading', async () => {
    mockDuplicateCheck(() => ({ is_duplicate: true }))
    let uploadCalled = false
    server.use(
      http.post(`http://localhost:8000/folders/${FOLDER_ID}/videos`, () => {
        uploadCalled = true
        return HttpResponse.json({ video_id: 'v', processing_job_id: 'j' }, { status: 201 })
      }),
    )
    mockBatchStatus(() => [])

    useUploadQueueStore.getState().enqueue([makeFile('dup.mp4', 5)], FOLDER_ID)
    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries[0]?.status).toBe('skipped')
    })
    expect(uploadCalled).toBe(false)
  })

  it('moves a successful upload to processing then ready once the job completes', async () => {
    mockDuplicateCheck(() => ({ is_duplicate: false }))
    mockUpload(() => ({ video_id: 'v-1', processing_job_id: 'j-1' }))
    mockBatchStatus((ids) =>
      ids.includes('v-1')
        ? [
            {
              video_id: 'v-1',
              status: 'ready',
              jobs: [
                {
                  id: 'j-1',
                  type: 'extract_metadata',
                  status: 'completed',
                  progress: 100,
                  error_message: null,
                },
              ],
            },
          ]
        : [],
    )

    useUploadQueueStore.getState().enqueue([makeFile('ok.mp4', 5)], FOLDER_ID)
    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries[0]?.status).toBe('ready')
    })
  })

  it('marks an upload failure as failed with no videoId', async () => {
    mockDuplicateCheck(() => ({ is_duplicate: false }))
    mockUpload(() => 'error')
    mockBatchStatus(() => [])

    useUploadQueueStore.getState().enqueue([makeFile('bad.mp4', 5)], FOLDER_ID)
    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      const entry = useUploadQueueStore.getState().entries[0]
      expect(entry?.status).toBe('failed')
      expect(entry?.videoId).toBeUndefined()
    })
  })

  it('marks a failed processing job as failed, keeping the videoId and failed job ids', async () => {
    mockDuplicateCheck(() => ({ is_duplicate: false }))
    mockUpload(() => ({ video_id: 'v-2', processing_job_id: 'j-2' }))
    mockBatchStatus((ids) =>
      ids.includes('v-2')
        ? [
            {
              video_id: 'v-2',
              status: 'failed',
              jobs: [
                {
                  id: 'j-2',
                  type: 'generate_proxy',
                  status: 'failed',
                  progress: 0,
                  error_message: 'boom',
                },
              ],
            },
          ]
        : [],
    )

    useUploadQueueStore.getState().enqueue([makeFile('jobfail.mp4', 5)], FOLDER_ID)
    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      const entry = useUploadQueueStore.getState().entries[0]
      expect(entry?.status).toBe('failed')
      expect(entry?.videoId).toBe('v-2')
      expect(entry?.jobIds).toEqual(['j-2'])
    })
  })

  it('one entry failing does not block a sibling in the same batch', async () => {
    // Discriminate by folder rather than by filename/size: multipart form
    // fields (the upload POST's body) don't reliably round-trip File
    // identity through MSW/undici in this test environment, but URL path
    // and query params (folder_id, the duplicate-check's filename/size) do.
    const BAD_FOLDER_ID = 'folder-bad'
    mockDuplicateCheck((filename) => ({ is_duplicate: filename === 'dup.mp4' }))
    server.use(
      http.get(`http://localhost:8000/folders/${BAD_FOLDER_ID}/videos/duplicate-check`, () =>
        HttpResponse.json({ is_duplicate: false, video_id: null }),
      ),
      http.post(`http://localhost:8000/folders/${BAD_FOLDER_ID}/videos`, () =>
        HttpResponse.json({ error: { code: 'BAD_REQUEST', message: 'nope' } }, { status: 400 }),
      ),
    )
    mockUpload(() => ({ video_id: 'v-ok', processing_job_id: 'j-ok' }))
    mockBatchStatus(() => [])

    useUploadQueueStore
      .getState()
      .enqueue([makeFile('dup.mp4', 1), makeFile('ok.mp4', 3)], FOLDER_ID)
    useUploadQueueStore.getState().enqueue([makeFile('bad.mp4', 2)], BAD_FOLDER_ID)
    renderHook(() => useUploadRunner(), { wrapper })

    await waitFor(() => {
      const byName = Object.fromEntries(
        useUploadQueueStore.getState().entries.map((e) => [e.fileName, e.status]),
      )
      expect(byName).toEqual({ 'dup.mp4': 'skipped', 'bad.mp4': 'failed', 'ok.mp4': 'processing' })
    })
  })
})

describe('useUploadRunner retryEntry', () => {
  it('re-queues an upload-stage failure without touching other entries', async () => {
    mockDuplicateCheck(() => ({ is_duplicate: false }))
    mockUpload(() => ({ video_id: 'v', processing_job_id: 'j' }))
    mockBatchStatus(() => [])

    useUploadQueueStore.setState({
      entries: [
        {
          localId: 'a',
          folderId: FOLDER_ID,
          fileName: 'a.mp4',
          fileSize: 1,
          status: 'failed',
          error: 'Upload failed',
        },
        {
          localId: 'b',
          folderId: FOLDER_ID,
          fileName: 'b.mp4',
          fileSize: 2,
          status: 'failed',
          error: 'Upload failed',
        },
      ],
      files: { a: makeFile('a.mp4', 1), b: makeFile('b.mp4', 2) },
    })

    const { result } = renderHook(() => useUploadRunner(), { wrapper })
    result.current.retryEntry('a')

    await waitFor(() => {
      expect(
        useUploadQueueStore.getState().entries.find((e) => e.localId === 'a')?.status,
      ).not.toBe('failed')
    })
    expect(useUploadQueueStore.getState().entries.find((e) => e.localId === 'b')?.status).toBe(
      'failed',
    )
  })

  it('retries only the failed job for a processing-stage failure', async () => {
    let retriedJobId: string | null = null
    server.use(
      http.post('http://localhost:8000/jobs/:jobId/retry', ({ params }) => {
        retriedJobId = params.jobId as string
        return HttpResponse.json({
          id: retriedJobId,
          type: 'generate_proxy',
          status: 'pending',
          progress: 0,
          error_message: null,
        })
      }),
    )
    mockBatchStatus(() => [])

    useUploadQueueStore.setState({
      entries: [
        {
          localId: 'a',
          folderId: FOLDER_ID,
          fileName: 'a.mp4',
          fileSize: 1,
          status: 'failed',
          videoId: 'v-a',
          jobIds: ['j-a'],
          error: 'Processing failed',
        },
      ],
      files: {},
    })

    const { result } = renderHook(() => useUploadRunner(), { wrapper })
    result.current.retryEntry('a')

    await waitFor(() => expect(retriedJobId).toBe('j-a'))
    await waitFor(() => {
      expect(useUploadQueueStore.getState().entries[0]?.status).toBe('processing')
    })
  })
})
