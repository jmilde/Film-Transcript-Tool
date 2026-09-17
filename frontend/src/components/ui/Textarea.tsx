import type { TextareaHTMLAttributes } from 'react'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`rounded-lg border border-glass-line bg-glass px-3 py-1.5 text-body text-text placeholder:text-text-muted backdrop-blur-sm focus:border-brand focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}
