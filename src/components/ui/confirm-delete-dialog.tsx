"use client";
import * as React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmation for a destructive action.
 *
 * `archiveNote` explains what happens when the record is still in use — the
 * API archives rather than destroys in that case, and the user should know
 * before clicking, not after.
 */
export function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  archiveNote,
  confirmLabel = "Delete",
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  archiveNote?: string;
  confirmLabel?: string;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="space-y-4">
        {archiveNote && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{archiveNote}</span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            className="bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
