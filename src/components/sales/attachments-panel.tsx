"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Paperclip, Upload, Trash2, Loader2, Mic, Square, Download, FileText,
} from "lucide-react";
import { apiSend, apiUpload } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative, type PersonRef } from "./sales-bits";

export type SalesAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isVoiceNote: boolean;
  createdAt: string;
  uploadedBy?: PersonRef | null;
};

/** Which sales object the files hang off. Exactly one is sent to the API. */
export type AttachmentParent =
  | { leadId: string }
  | { meetingId: string }
  | { briefId: string }
  | { feedbackId: string }
  | { proposalId: string };

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * File and voice-note attachments for any sales object.
 *
 * Uploads go through apiUpload (multipart, with the shared 401-refresh
 * behaviour); the payload is stored as bytes server-side, so there is nothing
 * to configure and no external bucket in play.
 */
export function AttachmentsPanel({
  parent,
  attachments,
  invalidateKeys,
  readOnly,
}: {
  parent: AttachmentParent;
  attachments: SalesAttachment[];
  /** Query keys to refresh after a change. */
  invalidateKeys: unknown[][];
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function refresh() {
    for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
  }

  const upload = useMutation({
    mutationFn: async ({ file, isVoiceNote }: { file: File; isVoiceNote?: boolean }) => {
      if (file.size > MAX_BYTES) {
        throw new Error(`Files must be ${MAX_BYTES / 1024 / 1024}MB or smaller.`);
      }
      const form = new FormData();
      form.append("file", file);
      for (const [k, v] of Object.entries(parent)) form.append(k, v as string);
      if (isVoiceNote) form.append("isVoiceNote", "1");
      return apiUpload("/api/sales/attachments", form);
    },
    onSuccess: () => {
      toast.success("Uploaded");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend(`/api/sales/attachments/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Attachment deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate({ file });
              // Clear so selecting the same file twice still fires onChange.
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload file
          </Button>
          <VoiceRecorder
            onRecorded={(file) => upload.mutate({ file, isVoiceNote: true })}
            disabled={upload.isPending}
          />
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                {a.isVoiceNote ? <Mic className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {formatBytes(a.size)}
                  {a.uploadedBy && (
                    <>
                      <span>·</span>
                      <Avatar
                        firstName={a.uploadedBy.firstName}
                        lastName={a.uploadedBy.lastName}
                        src={a.uploadedBy.avatarUrl}
                        size={14}
                      />
                      {a.uploadedBy.firstName}
                    </>
                  )}
                  <span>·</span>
                  {formatRelative(a.createdAt)}
                </div>
              </div>

              {/* Voice notes play inline; anything else is a download. */}
              {a.isVoiceNote ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio controls src={`/api/sales/attachments/${a.id}`} className="h-8 max-w-[190px]" />
              ) : (
                <a
                  href={`/api/sales/attachments/${a.id}?download=1`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Download ${a.name}`}
                >
                  <Download className="size-4" />
                </a>
              )}

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                  aria-label={`Delete ${a.name}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Record a voice note from the microphone.
 *
 * MediaRecorder is feature-detected rather than assumed: it is unavailable on
 * insecure origins and in a few browsers, and the button simply does not render
 * there instead of failing at click time.
 */
function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  // Releasing the microphone on unmount matters: without it the browser keeps
  // showing the recording indicator after the dialog closes.
  React.useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = (recorder.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        onRecorded(new File([blob], `voice-note-${stamp}.${ext}`, { type: blob.type }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Could not access the microphone.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      size="sm"
      onClick={recording ? stop : start}
      disabled={disabled}
    >
      {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
      {recording ? "Stop recording" : "Voice note"}
    </Button>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { Paperclip };
