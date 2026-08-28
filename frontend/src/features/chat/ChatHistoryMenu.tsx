import { useState } from 'react'
import { useChatConversations } from '../../api/hooks/useChat'

interface ChatHistoryMenuProps {
  projectId: string
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
  onNewChat: () => void
}

/** A dropdown of the project's past conversations, most recently active first. */
export function ChatHistoryMenu({
  projectId,
  activeConversationId,
  onSelect,
  onNewChat,
}: ChatHistoryMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: conversations } = useChatConversations(projectId)

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        History
      </button>
      {isOpen && (
        <>
          {/* Click-outside-to-close backdrop. */}
          <button
            type="button"
            aria-label="Close conversation history"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onNewChat()
                setIsOpen(false)
              }}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + New chat
            </button>
            <ul className="max-h-80 overflow-y-auto">
              {conversations && conversations.length > 0 ? (
                conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(conversation.id)
                        setIsOpen(false)
                      }}
                      className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        conversation.id === activeConversationId
                          ? 'bg-slate-50 font-medium text-slate-900'
                          : 'text-slate-600'
                      }`}
                    >
                      {conversation.title ?? 'Untitled conversation'}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-slate-400">No conversations yet.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
