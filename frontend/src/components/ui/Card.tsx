import type { HTMLAttributes } from 'react'

export type CardVariant = 'airy' | 'dense'
export type CardTint = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `airy`: browsing-page pastel treatment (Projects/Search/Chat).
   * `dense`: neutral workspace treatment — color reserved for meaning. */
  variant?: CardVariant
  /** Only meaningful for `variant="airy"` — `dense` always stays neutral. */
  tint?: CardTint
}

const TINT_CLASSES: Record<CardTint, string> = {
  brand: 'bg-brand-subtle',
  success: 'bg-success-subtle',
  warning: 'bg-warning-subtle',
  danger: 'bg-danger-subtle',
  info: 'bg-info-subtle',
  neutral: 'bg-surface',
}

export function Card({ variant = 'dense', tint = 'neutral', className = '', ...props }: CardProps) {
  const base =
    variant === 'airy'
      ? `rounded-lg p-4 shadow-sm ${TINT_CLASSES[tint]}`
      : 'rounded-md border border-border bg-surface p-3'
  return <div className={`${base} ${className}`} {...props} />
}
