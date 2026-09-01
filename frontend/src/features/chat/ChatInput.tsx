import { useState, type FormEvent } from 'react'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

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
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
        placeholder="Ask about this project's videos…"
        className="w-full"
      />
      <Button type="submit" disabled={isPending || !value.trim()} className="shrink-0">
        {isPending ? 'Thinking…' : 'Send'}
      </Button>
    </form>
  )
}
