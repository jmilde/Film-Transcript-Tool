import { useState } from 'react'
import {
  useCreateExport,
  useDownloadExport,
  useExport,
  type ExportType,
} from '../../api/hooks/useExports'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/Popover'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

interface ExportControlProps {
  videoName: string | undefined
  transcripts: TranscriptSummary[] | undefined
  defaultTranscriptId: string | null
}

const EXTENSIONS: Record<ExportType, string> = { markdown: 'md', srt: 'srt' }
const FORMAT_OPTIONS: { value: ExportType; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'srt', label: 'SRT' },
]

function slugify(name: string) {
  return name.trim().replace(/\s+/g, '-').toLowerCase() || 'export'
}

/**
 * Export dialog (docs §15): pick a transcript (original or a translation —
 * translations export the same way, per docs/900_export.md §7) and a format,
 * request the export, poll `GET /exports/{id}` until `ready`, then download
 * the rendered file.
 */
export function ExportControl({ videoName, transcripts, defaultTranscriptId }: ExportControlProps) {
  const [open, setOpen] = useState(false)
  const [transcriptId, setTranscriptId] = useState<string | null>(defaultTranscriptId)
  const [format, setFormat] = useState<ExportType>('markdown')
  const [exportId, setExportId] = useState<string | null>(null)

  const activeTranscriptId = transcriptId ?? defaultTranscriptId
  const createExport = useCreateExport(activeTranscriptId ?? '')
  const { data: exportRecord } = useExport(exportId)
  const downloadExport = useDownloadExport()

  const options = transcripts ?? []

  function submit() {
    if (!activeTranscriptId) return
    createExport.mutate(format, { onSuccess: (response) => setExportId(response.export_id) })
  }

  function download() {
    if (!exportRecord || !exportRecord.ready) return
    const label = options.find((t) => t.id === exportRecord.transcript_id)?.language ?? 'export'
    const filename = `${slugify(videoName ?? 'transcript')}-${label}.${EXTENSIONS[exportRecord.type]}`
    downloadExport.mutate({ exportId: exportRecord.id, filename })
  }

  const preparing = exportId !== null && !exportRecord?.ready

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" disabled={options.length === 0}>
          Export
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2 text-small">
        <label className="block">
          <span className="mb-1 block text-text-muted">Transcript</span>
          <Select
            aria-label="Transcript"
            value={activeTranscriptId ?? ''}
            onValueChange={(value) => {
              setTranscriptId(value || null)
              setExportId(null)
            }}
            options={options.map((t) => ({
              value: t.id,
              label: t.type === 'original' ? `Original (${t.language ?? t.id})` : (t.language ?? t.id),
            }))}
            className="w-full"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-text-muted">Format</span>
          <Select
            aria-label="Format"
            value={format}
            onValueChange={(value) => {
              setFormat(value as ExportType)
              setExportId(null)
            }}
            options={FORMAT_OPTIONS}
            className="w-full"
          />
        </label>

        {!exportRecord?.ready ? (
          <Button onClick={submit} disabled={!activeTranscriptId || preparing} className="w-full">
            {preparing ? 'Preparing…' : 'Generate'}
          </Button>
        ) : (
          <Button onClick={download} className="w-full">
            Download
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
