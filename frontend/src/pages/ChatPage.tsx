import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAskChat, useChatConversation } from '../api/hooks/useChat'
import type { ChatCitation } from '../api/hooks/useChat'
import { ChatInput } from '../features/chat/ChatInput'
import { ChatMessageList } from '../features/chat/ChatMessageList'
import type { PendingSearchNav } from '../features/search/types'

export function ChatPage() {
  const { projectId, conversationId } = useParams<{
    projectId: string
    conversationId?: string
  }>()
  if (!projectId) return null
  return <ChatPageInner projectId={projectId} conversationId={conversationId ?? null} />
}

function ChatPageInner({
  projectId,
  conversationId,
}: {
  projectId: string
  conversationId: string | null
}) {
  const navigate = useNavigate()
  const { data: messages } = useChatConversation(projectId, conversationId)
  const ask = useAskChat(projectId)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  function handleSubmit(question: string) {
    setPendingQuestion(question)
    ask.mutate(
      { question, conversationId },
      {
        onSuccess: (data) => {
          setPendingQuestion(null)
          if (data.conversation_id !== conversationId) {
            void navigate(`/projects/${projectId}/chat/${data.conversation_id}`, {
              replace: true,
            })
          }
        },
        onError: () => setPendingQuestion(null),
      },
    )
  }

  // Reuses SearchPage's nav-state shape so VideoWorkspace's pending-search
  // effect (seek + range-highlight in the original transcript pane) applies
  // unchanged; endTokenId carries the full citation span, not just its start.
  function handleSelectCitation(citation: ChatCitation) {
    const nav: PendingSearchNav = {
      kind: 'transcript',
      id: citation.start_token_id,
      transcriptId: citation.transcript_id,
      startTime: citation.start_time,
      endTokenId: citation.end_token_id,
      returnTo: `/projects/${projectId}/chat/${conversationId ?? ''}`,
    }
    void navigate(`/videos/${citation.video_id}`, { state: nav })
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:underline">
          ← Project
        </Link>
        <h2 className="text-lg font-semibold text-slate-800">Ask</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {(messages && messages.length > 0) || pendingQuestion ? (
          <ChatMessageList
            messages={messages ?? []}
            onSelectCitation={handleSelectCitation}
            pendingQuestion={pendingQuestion}
            isAnswering={ask.isPending}
          />
        ) : (
          <p className="text-sm text-slate-400">Ask a question about this project's videos.</p>
        )}
        {ask.isError && <p className="text-sm text-red-600">Something went wrong. Try again.</p>}
      </div>

      <div className="mt-3">
        <ChatInput isPending={ask.isPending} onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
