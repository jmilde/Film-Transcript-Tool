import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAskChat, useChatConversation, useChatConversations } from '../api/hooks/useChat'
import type { ChatCitation } from '../api/hooks/useChat'
import { useProject } from '../api/hooks/useProjects'
import { ChatHistorySidebar } from '../features/chat/ChatHistorySidebar'
import { ChatInput } from '../features/chat/ChatInput'
import { ChatMessageList } from '../features/chat/ChatMessageList'
import type { PendingSearchNav } from '../features/search/types'
import { useDocumentPanelStore } from '../store/documentPanel'

export function ChatPage() {
  const { projectId, conversationId } = useParams<{
    projectId: string
    conversationId?: string
  }>()
  if (!projectId) return null
  // `/chat/new` explicitly starts a blank conversation; a bare `/chat` (no
  // id at all) means "open whatever I was last looking at" — see the
  // auto-redirect effect below.
  const isExplicitNew = conversationId === 'new'
  return (
    <ChatPageInner
      projectId={projectId}
      conversationId={isExplicitNew ? null : (conversationId ?? null)}
      isExplicitNew={isExplicitNew}
    />
  )
}

function ChatPageInner({
  projectId,
  conversationId,
  isExplicitNew,
}: {
  projectId: string
  conversationId: string | null
  isExplicitNew: boolean
}) {
  const navigate = useNavigate()
  const { data: conversations } = useChatConversations(projectId)
  const { data: messages } = useChatConversation(projectId, conversationId)
  const ask = useAskChat(projectId)
  const { data: project } = useProject(projectId)
  const canEdit = project ? project.my_role !== 'viewer' : false
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  const setActiveProject = useDocumentPanelStore((s) => s.setActiveProject)
  useEffect(() => setActiveProject(projectId), [projectId, setActiveProject])

  // Landing on the bare `/chat` route (not `/chat/new`, no id in the URL)
  // defaults to the most recently active conversation rather than a blank
  // compose screen — most recent is always first, per the backend's ordering.
  const mostRecentId = conversations && conversations.length > 0 ? conversations[0].id : null
  const awaitingDefaultConversation = !isExplicitNew && conversationId === null && !conversations
  useEffect(() => {
    if (!isExplicitNew && conversationId === null && mostRecentId) {
      void navigate(`/projects/${projectId}/chat/${mostRecentId}`, { replace: true })
    }
  }, [isExplicitNew, conversationId, mostRecentId, navigate, projectId])

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
    <div className="mx-auto flex h-full max-w-5xl gap-4">
      <ChatHistorySidebar
        projectId={projectId}
        activeConversationId={conversationId}
        onNewChat={() => void navigate(`/projects/${projectId}/chat/new`)}
        onSelect={(id) => void navigate(`/projects/${projectId}/chat/${id}`)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-3">
          <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:underline">
            ← Project
          </Link>
          <h2 className="text-lg font-semibold text-slate-800">Ask</h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {awaitingDefaultConversation ? null : (messages && messages.length > 0) ||
            pendingQuestion ? (
            <ChatMessageList
              messages={messages ?? []}
              onSelectCitation={handleSelectCitation}
              canEdit={canEdit}
              pendingQuestion={pendingQuestion}
              isAnswering={ask.isPending}
              statusMessage={ask.statusMessage}
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
    </div>
  )
}
