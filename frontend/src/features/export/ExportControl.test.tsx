import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ExportControl } from './ExportControl'
import { server } from '../../test/server'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

const VIDEO_ID = 'video-1'
const ORIGINAL_ID = 'transcript-original'
const TRANSLATION_ID = 'transcript-es'
const EXPORT_ID = 'export-1'

const transcripts: TranscriptSummary[] = [
  {
    id: ORIGINAL_ID,
    video_id: VIDEO_ID,
    language: 'en',
    type: 'original',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: TRANSLATION_ID,
    video_id: VIDEO_ID,
    language: 'es',
    type: 'translation',
    created_at: '2026-01-01T00:00:00Z',
  },
]

function renderControl() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ExportControl
        videoName="Interview A"
        transcripts={transcripts}
        defaultTranscriptId={ORIGINAL_ID}
      />
    </QueryClientProvider>,
  )
}

describe('ExportControl', () => {
  it('requests an export, polls until ready, then downloads it', async () => {
    let pollCount = 0
    server.use(
      http.post(`http://localhost:8000/transcripts/${ORIGINAL_ID}/exports`, async ({ request }) => {
        const body = (await request.json()) as { format: string }
        expect(body.format).toBe('markdown')
        return HttpResponse.json({ export_id: EXPORT_ID, processing_job_id: 'job-1' })
      }),
      http.get(`http://localhost:8000/exports/${EXPORT_ID}`, () => {
        pollCount += 1
        const ready = pollCount >= 2
        return HttpResponse.json({
          id: EXPORT_ID,
          transcript_id: ORIGINAL_ID,
          type: 'markdown',
          ready,
          created_at: '2026-01-01T00:00:00Z',
        })
      }),
      http.get(`http://localhost:8000/exports/${EXPORT_ID}/content`, () =>
        HttpResponse.text('# Interview A', { headers: { 'Content-Type': 'text/markdown' } }),
      ),
    )
    renderControl()

    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByText('Preparing…')).toBeInTheDocument()

    const downloadButton = await screen.findByRole(
      'button',
      { name: 'Download' },
      { timeout: 3000 },
    )
    const clickSpy = vi.fn()
    HTMLAnchorElement.prototype.click = clickSpy

    await userEvent.click(downloadButton)

    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
  })

  it('lets the user choose which transcript and format to export', async () => {
    server.use(
      http.post(
        `http://localhost:8000/transcripts/${TRANSLATION_ID}/exports`,
        async ({ request }) => {
          const body = (await request.json()) as { format: string }
          expect(body.format).toBe('srt')
          return HttpResponse.json({ export_id: EXPORT_ID, processing_job_id: 'job-1' })
        },
      ),
      http.get(`http://localhost:8000/exports/${EXPORT_ID}`, () =>
        HttpResponse.json({
          id: EXPORT_ID,
          transcript_id: TRANSLATION_ID,
          type: 'srt',
          ready: true,
          created_at: '2026-01-01T00:00:00Z',
        }),
      ),
    )
    renderControl()

    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await userEvent.selectOptions(screen.getByLabelText(/Transcript$/i), TRANSLATION_ID)
    await userEvent.selectOptions(screen.getByLabelText(/Format$/i), 'srt')
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument()
  })
})
