import { Folder as FolderIcon, Video as VideoIcon } from 'lucide-react'
import { thumbnailUrl } from '../../api/hooks/useMedia'
import { formatTime } from '../player/format'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import type { SearchHit, SearchVideoGroup } from '../../api/hooks/useSearch'

interface SearchVideoGroupCardProps {
  group: SearchVideoGroup
  onSelectHit: (hit: SearchHit) => void
}

const KIND_LABEL: Record<string, string> = {
  transcript: 'Transcript',
  speaker: 'Speaker',
  comment: 'Comment',
}

/**
 * One video's search matches (docs §14): thumbnail, name, folder path, then
 * every hit. No "Add to Document" entry point here — clip inserts are
 * queued only from a transcript selection (docs/1100_document_builder.md
 * §6), not from a search hit.
 */
export function SearchVideoGroupCard({ group, onSelectHit }: SearchVideoGroupCardProps) {
  return (
    <Card className="overflow-hidden !p-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {group.thumbnail_token ? (
          <img
            src={thumbnailUrl(group.video_id, group.thumbnail_token)}
            alt=""
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-surface-raised">
            <VideoIcon className="h-4 w-4 text-text-muted" />
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-text">{group.video_name}</div>
          {group.folder_path.length > 0 && (
            <div className="flex items-center gap-1 truncate text-small text-text-muted">
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="truncate">{group.folder_path.join(' / ')}</span>
            </div>
          )}
        </div>
      </div>
      <div>
        {group.hits.map((hit) => (
          <button
            key={`${hit.kind}-${hit.id}`}
            type="button"
            onClick={() => onSelectHit(hit)}
            className="flex w-full min-w-0 items-center gap-3 border-b border-border px-4 py-2 text-left text-body last:border-b-0 hover:bg-surface-raised"
          >
            <Badge variant="neutral">{KIND_LABEL[hit.kind] ?? hit.kind}</Badge>
            <span className="flex-1 truncate text-text">{hit.text}</span>
            {hit.start_time !== null && (
              <span className="shrink-0 font-mono text-small text-text-muted">
                {formatTime(hit.start_time)}
              </span>
            )}
          </button>
        ))}
        {group.hit_count > group.hits.length && (
          <div className="px-4 py-2 text-small text-text-muted">
            +{group.hit_count - group.hits.length} more matches
          </div>
        )}
      </div>
    </Card>
  )
}
