import type { ReactNode } from 'react'
import { ChatCitationCard } from './ChatCitationCard'
import type { ChatCitation, ChatMessage } from '../../api/hooks/useChat'

interface ChatMessageListProps {
  messages: ChatMessage[]
  onSelectCitation: (citation: ChatCitation) => void
  canEdit: boolean
}

const MARKER_RE = /\[(\d+)\]/g

/**
 * Splits an assistant answer on its inline `[n]` markers and interleaves a
 * `ChatCitationCard` at each one whose citation survived the backend's
 * hallucination guard. A marker with no matching citation renders as plain
 * text rather than throwing on an undefined lookup — the guard can drop a
 * cited chunk whose marker still sits in the prose. Citations without a
 * marker occurrence in the text are never reached by this loop, so they're
 * silently omitted rather than appended separately.
 */
function renderAnswer(
  content: string,
  citations: ChatCitation[] | null,
  onSelectCitation: (citation: ChatCitation) => void,
  canEdit: boolean,
): ReactNode[] {
  const byMarker = new Map((citations ?? []).map((citation) => [citation.marker, citation]))
  const parts: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  MARKER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKER_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{content.slice(lastIndex, match.index)}</span>)
    }
    const citation = byMarker.get(Number(match[1]))
    parts.push(
      citation ? (
        <ChatCitationCard
          key={key++}
          citation={citation}
          onClick={() => onSelectCitation(citation)}
          canEdit={canEdit}
        />
      ) : (
        <span key={key++}>{match[0]}</span>
      ),
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>)
  }
  return parts
}

/** Renders a conversation's messages, interleaving citation cards into assistant answers. */
export function ChatMessageList({ messages, onSelectCitation, canEdit }: ChatMessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="text-right">
            <span className="inline-block max-w-lg rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">
              {message.content}
            </span>
          </div>
        ) : (
          <div key={message.id} className="max-w-lg space-y-1 text-sm text-slate-800">
            {renderAnswer(message.content, message.citations, onSelectCitation, canEdit)}
          </div>
        ),
      )}
    </div>
  )
}
