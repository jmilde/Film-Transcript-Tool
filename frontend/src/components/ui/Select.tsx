import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** Simplified flat-option-list API — a drop-in replacement for a native
 * `<select>` (TranslationControl, ExportControl, the document switcher),
 * not the general Radix compound API, since every current call site is
 * "pick one of these labeled values." */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className = '',
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-body text-text outline-none disabled:opacity-50 ${className}`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-40 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-lg data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-body text-text outline-none data-[highlighted]:bg-surface"
              >
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-brand" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
