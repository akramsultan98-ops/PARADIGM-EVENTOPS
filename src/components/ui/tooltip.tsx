"use client";
import * as T from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
export const TooltipProvider = T.Provider;
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal><T.Content side={side} sideOffset={4} className={cn("z-50 max-w-xs rounded-md bg-brand-navy px-2.5 py-1.5 text-xs text-white shadow-raised")}>{content}</T.Content></T.Portal>
    </T.Root>
  );
}
