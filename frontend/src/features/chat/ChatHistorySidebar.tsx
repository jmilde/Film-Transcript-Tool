import { useChatConversations } from '../../api/hooks/useChat'
import { Button } from '../../components/ui/Button'

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
    <div className="flex w-56 shrink-0 flex-col border-r border-border pr-3">
      <Button variant="secondary" size="sm" onClick={onNewChat} className="mb-2 justify-start">
        + New chat
      </Button>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {conversations && conversations.length > 0 ? (
          conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-body hover:bg-surface-raised ${
                  conversation.id === activeConversationId
                    ? 'bg-brand-subtle font-medium text-text'
                    : 'text-text-muted'
                }`}
              >
                {conversation.title ?? 'Untitled conversation'}
              </button>
            </li>
          ))
        ) : (
          <li className="px-2 py-1.5 text-small text-text-muted">No conversations yet.</li>
        )}
      </ul>
    </div>
  )
}
