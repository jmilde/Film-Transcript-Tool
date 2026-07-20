import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateTranslation } from '../../api/hooks/useTranslate'
import { useJob } from '../../api/hooks/useJobs'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

interface TranslationControlProps {
  videoId: string
  originalTranscriptId: string | null
  transcripts: TranscriptSummary[] | undefined
  secondTranscriptId: string | null
  onSelectSecond: (transcriptId: string | null) => void
}

function resultTranscriptId(result: { [key: string]: unknown } | null | undefined) {
  const id = result?.transcript_id
  return typeof id === 'string' ? id : null
}

/**
 * Requests a translation of the original transcript (docs §11) and lets the
 * user pick which existing translation, if any, shows in the second pane.
 * The translate endpoint only enqueues a worker job (translation runs out of
 * request, per the architecture rules), so this polls it via `useJob` and,
 * once it completes, refetches the transcript list and switches the second
 * pane to the newly created transcript.
 */
export function TranslationControl({
  videoId,
  originalTranscriptId,
  transcripts,
  secondTranscriptId,
  onSelectSecond,
}: TranslationControlProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [targetLanguage, setTargetLanguage] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const appliedJobRef = useRef<string | null>(null)

  const createTranslation = useCreateTranslation(originalTranscriptId ?? '')
  const { data: job } = useJob(jobId)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!job || job.id === appliedJobRef.current) return
    if (job.status === 'completed') {
      appliedJobRef.current = job.id
      void queryClient.invalidateQueries({ queryKey: ['transcripts', videoId] })
      const newId = resultTranscriptId(job.result)
      if (newId) onSelectSecond(newId)
      setJobId(null)
    } else if (job.status === 'failed') {
      appliedJobRef.current = job.id
    }
  }, [job, queryClient, videoId, onSelectSecond])

  const translations = (transcripts ?? []).filter((t) => t.type === 'translation')

  function submit() {
    const language = targetLanguage.trim()
    if (!language || !originalTranscriptId) return
    createTranslation.mutate(language, {
      onSuccess: (response) => setJobId(response.job_id),
    })
    setFormOpen(false)
    setTargetLanguage('')
  }

  const translating = jobId !== null && job?.status !== 'failed'

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        value={secondTranscriptId ?? ''}
        onChange={(e) => onSelectSecond(e.target.value || null)}
        className="rounded border border-slate-300 px-1.5 py-1 text-slate-600"
        aria-label="Translation pane"
      >
        <option value="">No translation pane</option>
        {translations.map((t) => (
          <option key={t.id} value={t.id}>
            {t.language ?? t.id}
          </option>
        ))}
      </select>

      {formOpen ? (
        <>
          <input
            autoFocus
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setFormOpen(false)
            }}
            placeholder="e.g. en"
            className="w-16 rounded border border-slate-300 px-1.5 py-1"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
          >
            Go
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={!originalTranscriptId}
          className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          + Translate
        </button>
      )}

      {translating && <span className="text-slate-400">Translating…</span>}
      {job?.status === 'failed' && <span className="text-red-600">Translation failed.</span>}
    </div>
  )
}
