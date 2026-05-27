"use client"

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "overflow-hidden rounded-xl border border-[rgba(2,89,24,0.10)] bg-white transition-shadow",
        "data-[open]:shadow-[0_8px_24px_-12px_rgba(2,89,24,0.18)]",
        className,
      )}
      {...props}
    />
  )
}

function AccordionHeader({
  className,
  children,
  ...props
}: AccordionPrimitive.Header.Props) {
  return (
    <AccordionPrimitive.Header
      data-slot="accordion-header"
      className={cn("flex", className)}
      {...props}
    >
      {children}
    </AccordionPrimitive.Header>
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        "group/trigger flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-900 transition-colors",
        "hover:bg-[var(--color-pmb-mist,#f7faf7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green,#025918)]/40 focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-data-[panel-open]/trigger:rotate-180"
        aria-hidden
      />
    </AccordionPrimitive.Trigger>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "h-[var(--accordion-panel-height)] overflow-hidden text-sm transition-[height] duration-200 ease-out",
        "data-[closed]:h-0",
        className,
      )}
      {...props}
    >
      <div className="border-t border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist,#f7faf7)] px-4 py-4">
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionContent,
}
