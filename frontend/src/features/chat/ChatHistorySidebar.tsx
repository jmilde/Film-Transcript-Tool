import { useChatConversations } from '../../api/hooks/useChat'

interface ChatHistorySidebarProps {
  projectId: string
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
  onNewChat: () => void
}

/** A persistent left-hand panel of the project's past conversations. */
export function ChatHistorySidebar({
  projectId,
  activeConversationId,
  onSelect,
  onNewChat,
}: ChatHistorySidebarProps) {
  const { data: conversations } = useChatConversations(projectId)

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-slate-200 pr-3">
      <button
        type="button"
        onClick={onNewChat}
        className="mb-2 rounded border border-slate-300 px-2 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        + New chat
      </button>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {conversations && conversations.length > 0 ? (
          conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                  conversation.id === activeConversationId
                    ? 'bg-slate-100 font-medium text-slate-900'
                    : 'text-slate-600'
                }`}
              >
                {conversation.title ?? 'Untitled conversation'}
              </button>
            </li>
          ))
        ) : (
          <li className="px-2 py-1.5 text-sm text-slate-400">No conversations yet.</li>
        )}
      </ul>
    </div>
  )
}
