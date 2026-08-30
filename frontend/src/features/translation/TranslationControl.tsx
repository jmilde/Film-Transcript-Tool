import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateTranslation } from '../../api/hooks/useTranslate'
import { useJob } from '../../api/hooks/useJobs'
import { Languages as TranslateIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
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
    <div className="flex items-center gap-2 text-small">
      <Popover
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open)
          if (!open) setAddOpen(false)
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <TranslateIcon className="h-4 w-4" />
            {currentLabel ?? 'Translations'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-0">
          {addOpen ? (
            <div className="space-y-2 p-2">
              <Select
                aria-label="Target language"
                value={targetLanguage}
                onValueChange={setTargetLanguage}
                options={availableLanguages.map((l) => ({ value: l.code, label: l.name }))}
                className="w-full"
              />
              <div className="flex justify-end gap-1">
                <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitTranslation} disabled={!targetLanguage}>
                  Translate
                </Button>
              </div>
            </div>
          ) : (
            <>
              {translations.length === 0 && (
                <div className="px-3 py-2 text-text-muted">No translations yet.</div>
              )}
              {translations.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectExisting(t.id)}
                  className={`block w-full px-3 py-1.5 text-left hover:bg-surface-raised ${
                    t.id === secondTranscriptId ? 'font-medium text-text' : 'text-text-muted'
                  }`}
                >
                  {languageName(t.language) ?? t.language ?? t.id}
                </button>
              ))}
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={openAdd}
                  disabled={!originalTranscriptId || availableLanguages.length === 0}
                  className="block w-full px-3 py-1.5 text-left text-text-muted hover:bg-surface-raised disabled:opacity-50"
                >
                  + Add translation
                </button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {translating && <span className="text-text-muted">Translating…</span>}
      {job?.status === 'failed' && <span className="text-danger-text">Translation failed.</span>}
    </div>
  )
}
