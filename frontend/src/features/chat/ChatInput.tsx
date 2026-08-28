import { useState, type FormEvent } from 'react'

interface ChatInputProps {
  isPending: boolean
  onSubmit: (question: string) => void
}

/** Question input + send button; disabled with a "Thinking…" state while the request is in flight. */
export function ChatInput({ isPending, onSubmit }: ChatInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const question = value.trim()
    if (!question || isPending) return
    onSubmit(question)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
        placeholder="Ask about this project's videos…"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
      />
      <button
        type="submit"
        disabled={isPending || !value.trim()}
        className="shrink-0 rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? 'Thinking…' : 'Send'}
      </button>
    </form>
  )
}
