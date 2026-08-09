import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={`flex h-9 w-full items-center justify-between rounded border border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] bg-[var(--color-card,var(--background-base))] px-2.5 py-2 text-xs outline-none ${className}`} {...props}>
    {children}<SelectPrimitive.Icon asChild><ChevronDown size={13} /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Portal><SelectPrimitive.Content ref={ref} position="popper" className={`z-50 max-h-96 min-w-[8rem] overflow-hidden rounded border border-white/10 bg-[var(--color-card,var(--background-base))] text-xs shadow-md ${className}`} {...props}>
    <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center"><ChevronUp size={13} /></SelectPrimitive.ScrollUpButton>
    <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center"><ChevronDown size={13} /></SelectPrimitive.ScrollDownButton>
  </SelectPrimitive.Content></SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item ref={ref} className={`relative flex w-full cursor-default select-none items-center rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white/10 ${className}`} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="absolute right-2"><Check size={13} /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
