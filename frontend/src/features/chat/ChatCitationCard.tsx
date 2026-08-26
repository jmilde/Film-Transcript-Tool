import { DocumentIcon, FolderIcon, VideoIcon } from '../../components/icons'
import { thumbnailUrl } from '../../api/hooks/useMedia'
import { formatTime } from '../player/format'
import { useDocumentPanelStore } from '../../store/documentPanel'
import type { ChatCitation } from '../../api/hooks/useChat'

interface ChatCitationCardProps {
  citation: ChatCitation
  onClick: () => void
}

/**
 * A single inline citation, rendered where its `[n]` marker sits in the
 * answer text. Visually modeled on `SearchVideoGroupCard` (thumbnail, video
 * name, folder breadcrumb, excerpt, timecode) but sized as a standalone card
 * rather than a list of hits within a video group.
 *
 * The main area and "Add to Document" are separate buttons (not one button
 * nested in another) since they trigger different actions — seek vs. queue
 * a clip insert.
 */
export function ChatCitationCard({ citation, onClick }: ChatCitationCardProps) {
  const queueInsert = useDocumentPanelStore((s) => s.queueInsert)

  return (
    <div className="my-1 flex w-full max-w-md items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {citation.thumbnail_token ? (
          <img
            src={thumbnailUrl(citation.video_id, citation.thumbnail_token)}
            alt=""
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-slate-100">
            <VideoIcon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-800">
              {citation.video_name}
            </span>
            <span className="shrink-0 font-mono text-xs text-slate-400">
              {formatTime(citation.start_time)}
            </span>
          </div>
          {citation.folder_path.length > 0 && (
            <div className="flex items-center gap-1 truncate text-xs text-slate-400">
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{citation.folder_path.join(' / ')}</span>
            </div>
          )}
          <p className="truncate text-xs text-slate-500">{citation.excerpt}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label="Add to Document"
        title="Add to Document"
        onClick={() =>
          queueInsert({
            transcriptId: citation.transcript_id,
            videoId: citation.video_id,
            startTokenId: citation.start_token_id,
            endTokenId: citation.end_token_id,
          })
        }
        className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <DocumentIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
