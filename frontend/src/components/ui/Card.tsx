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

// Airy cards are glass panels, so every tint (including `neutral`, which
// reuses the same glass-strong fill as the dense variant) needs to stay
// translucent for `backdrop-blur` to have anything to blur — a fully opaque
// tint would render as a flat color, not frosted glass.
const TINT_CLASSES: Record<CardTint, string> = {
  brand: 'bg-brand-subtle/70',
  success: 'bg-success-subtle/70',
  warning: 'bg-warning-subtle/70',
  danger: 'bg-danger-subtle/70',
  info: 'bg-info-subtle/70',
  neutral: 'bg-glass-strong',
}

export function Card({ variant = 'dense', tint = 'neutral', className = '', ...props }: CardProps) {
  const base =
    variant === 'airy'
      ? `rounded-2xl border border-glass-line p-4 shadow-sm backdrop-blur-md ${TINT_CLASSES[tint]}`
      : 'rounded-xl border border-glass-line bg-glass-strong p-3 backdrop-blur-md'
  return <div className={`${base} ${className}`} {...props} />
}
