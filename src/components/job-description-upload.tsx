"use client";
import * as React from "react";
import { FileText, Upload, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Mirrors the server-side limits in `src/lib/job-descriptions.ts`. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT = "application/pdf";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Client-side validation. The server re-validates everything including the
 * PDF magic bytes — this exists purely so the user gets an instant answer
 * instead of a round trip.
 */
export function validatePdf(file: File): string | null {
  if (file.type !== ACCEPT) return "Only PDF files are accepted.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(
      MAX_FILE_BYTES
    )}.`;
  }
  return null;
}

/**
 * PDF picker for the Add / Edit Employee forms.
 *
 * Controlled: the parent owns the selected `File` and submits it. Supports
 * drag-and-drop, shows the chosen file name and size, and lets the user swap
 * or clear the selection before saving.
 */
export function JobDescriptionUpload({
  file,
  onChange,
  currentFileName,
  disabled,
  className,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Name of the document already on record, if any. */
  currentFileName?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const accept = React.useCallback(
    (picked: File | undefined) => {
      if (!picked) return;
      const problem = validatePdf(picked);
      setError(problem);
      onChange(problem ? null : picked);
    },
    [onChange]
  );

  const clear = () => {
    setError(null);
    onChange(null);
    // Reset the input so re-picking the same file still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(file.size)} · PDF</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label="Remove selected file"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed p-5 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {currentFileName ? "Upload a new version" : "Upload job description"}
          </span>
          <span className="text-xs text-muted-foreground">
            PDF only · up to {formatBytes(MAX_FILE_BYTES)}
          </span>
        </button>
      )}

      {currentFileName && !file && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Current document: <span className="font-medium text-foreground">{currentFileName}</span>
        </p>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
