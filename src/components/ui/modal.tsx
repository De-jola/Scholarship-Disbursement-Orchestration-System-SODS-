"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
}

/** Accessible modal/drawer built on the native dialog element (focus trap and Esc handled by the browser). */
export function Modal({ open, onClose, title, description, children, footer, variant = "modal" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={cn(
        "p-0 text-slate-800 shadow-2xl",
        variant === "drawer"
          ? "m-0 ml-auto h-full max-h-none w-full max-w-2xl rounded-none"
          : "w-full max-w-lg rounded-lg",
      )}
    >
      {open && (
        <div className="flex h-full max-h-screen flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-navy-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
