import { DocumentIcon, FolderIcon, VideoIcon } from '../../components/icons'
import { thumbnailUrl } from '../../api/hooks/useMedia'
import { formatTime } from '../player/format'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { SearchHit, SearchVideoGroup } from '../../api/hooks/useSearch'

interface SearchVideoGroupCardProps {
  group: SearchVideoGroup
  onSelectHit: (hit: SearchHit) => void
  canEdit: boolean
}

const KIND_LABEL: Record<string, string> = {
  transcript: 'Transcript',
  speaker: 'Speaker',
  comment: 'Comment',
}

/** One video's search matches (docs §14): thumbnail, name, folder path, then every hit. */
export function SearchVideoGroupCard({ group, onSelectHit, canEdit }: SearchVideoGroupCardProps) {
  const queueInsert = useDocumentPanelStore((s) => s.queueInsert)

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {group.thumbnail_token ? (
          <img
            src={thumbnailUrl(group.video_id, group.thumbnail_token)}
            alt=""
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-slate-100">
            <VideoIcon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-800">{group.video_name}</div>
          {group.folder_path.length > 0 && (
            <div className="flex items-center gap-1 truncate text-xs text-slate-400">
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{group.folder_path.join(' / ')}</span>
            </div>
          )}
        </div>
      </div>
      <div>
        {group.hits.map((hit) => (
          <div
            key={`${hit.kind}-${hit.id}`}
            className="flex items-center border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
          >
            <button
              type="button"
              onClick={() => onSelectHit(hit)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left text-sm"
            >
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                {KIND_LABEL[hit.kind] ?? hit.kind}
              </span>
              <span className="flex-1 truncate text-slate-800">{hit.text}</span>
              {hit.start_time !== null && (
                <span className="shrink-0 font-mono text-xs text-slate-400">
                  {formatTime(hit.start_time)}
                </span>
              )}
            </button>
            {canEdit && hit.kind === 'transcript' && hit.transcript_id && (
              <button
                type="button"
                aria-label="Add to Document"
                title="Add to Document"
                onClick={() =>
                  queueInsert({
                    transcriptId: hit.transcript_id as string,
                    videoId: group.video_id,
                    startTokenId: hit.id,
                    endTokenId: hit.id,
                  })
                }
                className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <DocumentIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {group.hit_count > group.hits.length && (
          <div className="px-4 py-2 text-xs text-slate-400">
            +{group.hit_count - group.hits.length} more matches
          </div>
        )}
      </div>
    </div>
  )
}
