import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { TranslationControl } from './TranslationControl'
import { server } from '../../test/server'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

const VIDEO_ID = 'video-1'
const ORIGINAL_ID = 'transcript-original'
const JOB_ID = 'job-1'
const NEW_TRANSCRIPT_ID = 'transcript-es'

const transcripts: TranscriptSummary[] = [
  {
    id: ORIGINAL_ID,
    video_id: VIDEO_ID,
    language: 'en',
    type: 'original',
    created_at: '2026-01-01T00:00:00Z',
  },
]

function renderControl(onSelectSecond = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TranslationControl
        videoId={VIDEO_ID}
        originalTranscriptId={ORIGINAL_ID}
        transcripts={transcripts}
        secondTranscriptId={null}
        onSelectSecond={onSelectSecond}
      />
    </QueryClientProvider>,
  )
  return { onSelectSecond }
}

describe('TranslationControl', () => {
  it('requests a translation, polls the job, and selects the new transcript on completion', async () => {
    let jobPollCount = 0
    server.use(
      http.post(
        `http://localhost:8000/transcripts/${ORIGINAL_ID}/translate`,
        async ({ request }) => {
          const body = (await request.json()) as { target_language: string }
          expect(body.target_language).toBe('es')
          return HttpResponse.json({ job_id: JOB_ID })
        },
      ),
      http.get(`http://localhost:8000/jobs/${JOB_ID}`, () => {
        jobPollCount += 1
        const status = jobPollCount < 2 ? 'running' : 'completed'
        return HttpResponse.json({
          id: JOB_ID,
          video_id: VIDEO_ID,
          type: 'translate',
          status,
          progress: status === 'completed' ? 1 : 0.5,
          error_message: null,
          result: status === 'completed' ? { transcript_id: NEW_TRANSCRIPT_ID } : null,
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:00:00Z',
          completed_at: null,
        })
      }),
    )
    const { onSelectSecond } = renderControl()

    await userEvent.click(screen.getByRole('button', { name: '+ Translate' }))
    await userEvent.type(screen.getByPlaceholderText('e.g. en'), 'es')
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Translating…')).toBeInTheDocument()

    await waitFor(() => expect(onSelectSecond).toHaveBeenCalledWith(NEW_TRANSCRIPT_ID), {
      timeout: 3000,
    })
    await waitFor(() => expect(screen.queryByText('Translating…')).not.toBeInTheDocument())
  })

  it('shows a failure message if the translation job fails', async () => {
    server.use(
      http.post(`http://localhost:8000/transcripts/${ORIGINAL_ID}/translate`, () =>
        HttpResponse.json({ job_id: JOB_ID }),
      ),
      http.get(`http://localhost:8000/jobs/${JOB_ID}`, () =>
        HttpResponse.json({
          id: JOB_ID,
          video_id: VIDEO_ID,
          type: 'translate',
          status: 'failed',
          progress: 0,
          error_message: 'no model installed',
          result: null,
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:00:00Z',
          completed_at: '2026-01-01T00:00:01Z',
        }),
      ),
    )
    renderControl()

    await userEvent.click(screen.getByRole('button', { name: '+ Translate' }))
    await userEvent.type(screen.getByPlaceholderText('e.g. en'), 'es')
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Translation failed.')).toBeInTheDocument()
  })

  it('lists existing translations in the pane dropdown and selects one', async () => {
    const withTranslation: TranscriptSummary[] = [
      ...transcripts,
      {
        id: 'transcript-fr',
        video_id: VIDEO_ID,
        language: 'fr',
        type: 'translation',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    const onSelectSecond = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TranslationControl
          videoId={VIDEO_ID}
          originalTranscriptId={ORIGINAL_ID}
          transcripts={withTranslation}
          secondTranscriptId={null}
          onSelectSecond={onSelectSecond}
        />
      </QueryClientProvider>,
    )

    await userEvent.selectOptions(screen.getByLabelText('Translation pane'), 'fr')
    expect(onSelectSecond).toHaveBeenCalledWith('transcript-fr')
  })
})
