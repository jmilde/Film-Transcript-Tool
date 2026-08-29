import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-text-inverted hover:bg-brand-hover active:bg-brand-active',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-raised',
  ghost: 'text-text hover:bg-surface-raised',
  destructive: 'bg-danger text-text-inverted hover:opacity-90 active:opacity-80',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-small',
  md: 'px-4 py-2 text-body',
}

/** Hand-rolled per ADR 0002 — Button's correctness doesn't hinge on focus
 * trapping/portals the way the overlay primitives do. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  )
}
