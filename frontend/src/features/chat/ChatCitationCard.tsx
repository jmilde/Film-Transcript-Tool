import { Folder, Video } from 'lucide-react'
import { thumbnailUrl } from '../../api/hooks/useMedia'
import { formatTime } from '../player/format'
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
 * No "Add to Document" entry point here — clip inserts are queued only from
 * a transcript selection (docs/1100_document_builder.md §6), not from a
 * citation card.
 */
export function ChatCitationCard({ citation, onClick }: ChatCitationCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="my-1 flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-raised"
    >
      {citation.thumbnail_token ? (
        <img
          src={thumbnailUrl(citation.video_id, citation.thumbnail_token)}
          alt=""
          className="h-10 w-16 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-surface-raised">
          <Video className="h-4 w-4 text-text-muted" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-text">{citation.video_name}</span>
          <span className="shrink-0 font-mono text-small text-text-muted">
            {formatTime(citation.start_time)}
          </span>
        </div>
        {citation.folder_path.length > 0 && (
          <div className="flex items-center gap-1 truncate text-small text-text-muted">
            <Folder className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="truncate">{citation.folder_path.join(' / ')}</span>
          </div>
        )}
        <p className="truncate text-small text-text-muted">{citation.excerpt}</p>
      </div>
    </button>
  )
}
