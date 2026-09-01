import type { InputHTMLAttributes } from 'react'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`rounded-md border border-border bg-surface px-3 py-1.5 text-body text-text placeholder:text-text-muted focus:border-brand focus:outline-none disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}
