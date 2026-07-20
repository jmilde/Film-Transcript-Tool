import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateTranslation } from '../../api/hooks/useTranslate'
import { useJob } from '../../api/hooks/useJobs'
import { TranslateIcon } from '../../components/icons'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

interface TranslationControlProps {
  videoId: string
  originalTranscriptId: string | null
  transcripts: TranscriptSummary[] | undefined
  secondTranscriptId: string | null
  onSelectSecond: (transcriptId: string | null) => void
}

// Common DeepL-supported target languages, offered as an enum since the
// backend accepts any ISO 639-1 code (docs §11) but a free-text field would
// be a poor "pick which language to add" experience.
const LANGUAGE_OPTIONS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
]

function languageName(code: string | null | undefined) {
  if (!code) return null
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.name ?? code
}

function resultTranscriptId(result: { [key: string]: unknown } | null | undefined) {
  const id = result?.transcript_id
  return typeof id === 'string' ? id : null
}

/**
 * A single button opens a panel listing existing translations (docs §11);
 * picking one shows it in the second transcript pane. Adding a new
 * translation is a separate step inside the same panel: pick a target
 * language from a fixed list and start the job. The translate endpoint only
 * enqueues a worker job (translation runs out of request, per the
 * architecture rules), so this polls it via `useJob` and, once it completes,
 * refetches the transcript list and switches the second pane to the newly
 * created transcript.
 */
export function TranslationControl({
  videoId,
  originalTranscriptId,
  transcripts,
  secondTranscriptId,
  onSelectSecond,
}: TranslationControlProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
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
      setAddOpen(false)
      setPanelOpen(false)
    } else if (job.status === 'failed') {
      appliedJobRef.current = job.id
    }
  }, [job, queryClient, videoId, onSelectSecond])

  const translations = (transcripts ?? []).filter((t) => t.type === 'translation')
  const availableLanguages = LANGUAGE_OPTIONS.filter(
    (l) => !translations.some((t) => t.language === l.code),
  )
  const translating = jobId !== null && job?.status !== 'failed'

  function selectExisting(transcriptId: string) {
    onSelectSecond(transcriptId)
    setPanelOpen(false)
  }

  function openAdd() {
    setTargetLanguage(availableLanguages[0]?.code ?? '')
    setAddOpen(true)
  }

  function submitTranslation() {
    if (!targetLanguage || !originalTranscriptId) return
    createTranslation.mutate(targetLanguage, {
      onSuccess: (response) => setJobId(response.job_id),
    })
  }

  const currentLabel = languageName(transcripts?.find((t) => t.id === secondTranscriptId)?.language)

  return (
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        className="flex items-center gap-1.5 rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100"
      >
        <TranslateIcon className="h-4 w-4" />
        {currentLabel ?? 'Translations'}
      </button>

      {translating && <span className="ml-2 text-slate-400">Translating…</span>}
      {job?.status === 'failed' && <span className="ml-2 text-red-600">Translation failed.</span>}

      {panelOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {addOpen ? (
              <div className="space-y-2 p-2">
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  aria-label="Target language"
                  className="w-full rounded border border-slate-300 px-1.5 py-1"
                >
                  {availableLanguages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitTranslation}
                    disabled={!targetLanguage}
                    className="rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Translate
                  </button>
                </div>
              </div>
            ) : (
              <>
                {translations.length === 0 && (
                  <div className="px-3 py-2 text-slate-400">No translations yet.</div>
                )}
                {translations.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectExisting(t.id)}
                    className={`block w-full px-3 py-1.5 text-left hover:bg-slate-50 ${
                      t.id === secondTranscriptId ? 'font-medium text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    {languageName(t.language) ?? t.language ?? t.id}
                  </button>
                ))}
                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={openAdd}
                    disabled={!originalTranscriptId || availableLanguages.length === 0}
                    className="block w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    + Add translation
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
