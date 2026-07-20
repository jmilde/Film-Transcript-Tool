import { useState } from 'react'
import {
  useCreateExport,
  useDownloadExport,
  useExport,
  type ExportType,
} from '../../api/hooks/useExports'
import type { TranscriptSummary } from '../../api/hooks/useTranscripts'

interface ExportControlProps {
  videoName: string | undefined
  transcripts: TranscriptSummary[] | undefined
  defaultTranscriptId: string | null
}

const EXTENSIONS: Record<ExportType, string> = { markdown: 'md', srt: 'srt' }

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
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        Export
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 space-y-2 rounded border border-slate-200 bg-white p-3 shadow-lg">
          <label className="block">
            <span className="mb-1 block text-slate-500">Transcript</span>
            <select
              value={activeTranscriptId ?? ''}
              onChange={(e) => {
                setTranscriptId(e.target.value || null)
                setExportId(null)
              }}
              className="w-full rounded border border-slate-300 px-1.5 py-1"
            >
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.type === 'original'
                    ? `Original (${t.language ?? t.id})`
                    : (t.language ?? t.id)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-500">Format</span>
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as ExportType)
                setExportId(null)
              }}
              className="w-full rounded border border-slate-300 px-1.5 py-1"
            >
              <option value="markdown">Markdown</option>
              <option value="srt">SRT</option>
            </select>
          </label>

          {!exportRecord?.ready ? (
            <button
              type="button"
              onClick={submit}
              disabled={!activeTranscriptId || preparing}
              className="w-full rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {preparing ? 'Preparing…' : 'Generate'}
            </button>
          ) : (
            <button
              type="button"
              onClick={download}
              className="w-full rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
            >
              Download
            </button>
          )}
        </div>
      )}
    </div>
  )
}
