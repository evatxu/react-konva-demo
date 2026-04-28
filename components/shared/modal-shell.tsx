"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ModalShellProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}

export function ModalShell({
  open,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "max-w-4xl"
}: ModalShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className={`w-full overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.18)] ${maxWidthClassName}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">{title}</div>
            {description ? <div className="text-sm text-slate-500">{description}</div> : null}
          </div>
          <Button type="button" variant="secondary" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-92px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
