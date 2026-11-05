import { memo } from 'react'
import { Select } from '../../components/ui/Select'
import { formatTime } from '../player/format'
import type { Speaker } from '../../api/hooks/useSpeakers'
import type { Token } from '../../api/hooks/useTranscripts'
import type { TranscriptRow as RowData } from './transcriptRows'

const SPEAKER_UNATTRIBUTED = '__unattributed__'

interface TranscriptRowProps {
  row: RowData
  canEdit: boolean
  speakers: Speaker[] | undefined
  speakerNames: Map<string, string>
  onReassignSpeaker: (segmentIds: string[], speakerId: string | null) => void
  /** The selection's index range, clipped to this row's token span — `null`
   * on both ends when the selection doesn't overlap this row at all. Passed
   * as a clipped primitive pair rather than the raw `selectedIds` Set, since
   * that Set gets a new identity on every drag `mouseenter`; a primitive
   * pair only changes for the (at most two) rows whose membership actually
   * changed, letting `memo` bail out for every other mounted row. */
  selectedStart: number | null
  selectedEnd: number | null
  /** Non-null only when the active/playing or current-search-match token is
   * inside this row — same clipping rationale as the selection range. */
  activeTokenId: string | null
  currentMatchId: string | null
  /** Passed by reference, unclipped — these only change on search-query or
   * comment-list updates, which are infrequent relative to drag/playback/
   * typing, so letting every mounted row re-render on those rarer events is
   * an acceptable simplification. */
  matchIds: ReadonlySet<string>
  commentedTokenInfo: ReadonlyMap<string, { resolved: boolean }>
  editingTokenId: string | null
  editingText: string
  onEditingTextChange: (text: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onTokenMouseDown: (token: Token) => void
  onTokenMouseEnter: (token: Token) => void
  onTokenDoubleClick: (token: Token) => void
}

export const TranscriptRow = memo(function TranscriptRow({
  row,
  canEdit,
  speakers,
  speakerNames,
  onReassignSpeaker,
  selectedStart,
  selectedEnd,
  activeTokenId,
  currentMatchId,
  matchIds,
  commentedTokenInfo,
  editingTokenId,
  editingText,
  onEditingTextChange,
  onCommitEdit,
  onCancelEdit,
  onTokenMouseDown,
  onTokenMouseEnter,
  onTokenDoubleClick,
}: TranscriptRowProps) {
  if (row.kind === 'header') {
    return (
      <div
        className={`${row.isFirstRow ? '' : 'pt-4'} pb-1 text-small font-semibold text-text-muted`}
      >
        {canEdit && speakers && speakers.length > 0 ? (
          <Select
            aria-label="Speaker"
            value={row.speakerId ?? SPEAKER_UNATTRIBUTED}
            onValueChange={(value) =>
              onReassignSpeaker(row.segmentIds, value === SPEAKER_UNATTRIBUTED ? null : value)
            }
            options={[
              { value: SPEAKER_UNATTRIBUTED, label: 'Unknown speaker' },
              ...speakers.map((s) => ({ value: s.id, label: s.name ?? 'Unnamed speaker' })),
            ]}
            className="h-auto min-w-0 border-none bg-transparent p-0 text-small font-semibold text-text-muted hover:text-text"
          />
        ) : row.speakerId ? (
          (speakerNames.get(row.speakerId) ?? 'Unknown speaker')
        ) : (
          'Unknown speaker'
        )}
      </div>
    )
  }

  return (
    <div className={row.isLastOfGroup ? 'pb-0' : 'pb-2'}>
      <div className="mb-0.5 font-mono text-small text-text-muted">
        {formatTime(row.tokens[0].start_time)}
      </div>
      <p className="leading-relaxed text-text">
        {row.tokens.map((token, i) => {
          const absoluteIndex = row.startIndex + i

          if (token.id === editingTokenId) {
            return (
              <input
                key={token.id}
                autoFocus
                value={editingText}
                onChange={(e) => onEditingTextChange(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCommitEdit()
                  if (e.key === 'Escape') onCancelEdit()
                }}
                style={{ width: `${Math.max(editingText.length, 3)}ch` }}
                className="rounded-sm border border-brand bg-surface px-0.5 text-text"
              />
            )
          }

          const isSelected =
            selectedStart !== null &&
            selectedEnd !== null &&
            absoluteIndex >= selectedStart &&
            absoluteIndex <= selectedEnd
          const isCurrentMatch = currentMatchId === token.id
          const isMatch = matchIds.has(token.id)
          // Selection (brand) > current search match (warning, vivid) >
          // active/playing token (info) > user-applied highlight
          // (highlight-subtle) > other matches (warning-subtle) > plain
          // hover — each state means something different, per the
          // workspace's "color reserved for meaning" rule.
          const bg = isSelected
            ? 'bg-brand-subtle'
            : isCurrentMatch
              ? 'bg-warning'
              : token.id === activeTokenId
                ? 'bg-info-subtle'
                : token.is_highlighted
                  ? 'bg-highlight-subtle'
                  : isMatch
                    ? 'bg-warning-subtle'
                    : 'hover:bg-glass'
          const comment = commentedTokenInfo.get(token.id)
          const decoration = comment
            ? comment.resolved
              ? 'underline decoration-success decoration-2 underline-offset-2'
              : 'underline decoration-warning decoration-2 underline-offset-2'
            : ''
          return (
            <span
              key={token.id}
              data-token-id={token.id}
              onMouseDown={() => onTokenMouseDown(token)}
              onMouseEnter={() => onTokenMouseEnter(token)}
              onDoubleClick={() => onTokenDoubleClick(token)}
              className={`${canEdit ? 'cursor-text' : 'cursor-default'} rounded px-0.5 ${bg} ${decoration}`}
            >
              {token.text}{' '}
            </span>
          )
        })}
      </p>
    </div>
  )
})
