import type { TextareaHTMLAttributes } from 'react'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`rounded-md border border-border bg-surface px-3 py-1.5 text-body text-text placeholder:text-text-muted focus:border-brand focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}
