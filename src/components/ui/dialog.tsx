"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, side, ...p }: React.ComponentProps<typeof D.Content> & { side?: "center" | "right" | "left" }) {
  const sideCls = side === "right" ? "inset-y-0 end-0 h-full w-[92vw] max-w-md rounded-none border-s data-[state=open]:slide-in-from-right rtl:data-[state=open]:slide-in-from-left"
    : side === "left" ? "inset-y-0 start-0 h-full w-[85vw] max-w-xs rounded-none border-e data-[state=open]:slide-in-from-left rtl:data-[state=open]:slide-in-from-right"
    : "left-1/2 top-1/2 max-h-[90vh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border data-[state=open]:zoom-in-95";
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-brand-navy-deep/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content className={cn("fixed z-50 overflow-y-auto bg-card shadow-raised data-[state=open]:animate-in data-[state=open]:fade-in-0", sideCls, className)} {...p}>
        {children}
        <D.Close className="absolute end-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="size-4" /></D.Close>
      </D.Content>
    </D.Portal>
  );
}
export const DialogHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("border-b px-5 py-4 pe-12", className)} {...p} />;
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof D.Title>) => <D.Title className={cn("font-display text-base font-semibold", className)} {...p} />;
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof D.Description>) => <D.Description className={cn("mt-1 text-xs text-muted-foreground", className)} {...p} />;
export const DialogBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("px-5 py-4", className)} {...p} />;
export const DialogFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-wrap justify-end gap-2 border-t px-5 py-3", className)} {...p} />;
