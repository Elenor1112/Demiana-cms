"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiSend, apiUpload } from "@/lib/fetcher";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Profile picture control.
 *
 * Anyone can change their own; changing somebody else's needs Employee.Edit,
 * which the API enforces. The picture is uploaded immediately rather than being
 * held until a surrounding form is submitted — it is a self-contained action and
 * the preview would otherwise lie about what is saved.
 */
export function AvatarUpload({
  userId,
  firstName,
  lastName,
  avatarUrl,
  size = 80,
}: {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Shows the picked file instantly while the upload is in flight.
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["employee", userId] });
    router.refresh();
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("avatar", file);
      return apiUpload<{ avatarUrl: string }>(`/api/employees/${userId}/avatar`, form);
    },
    onSuccess: () => { toast.success("Profile picture updated"); refresh(); },
    onError: (e: Error) => {
      toast.error(e.message);
      setPreview(null);
    },
  });

  const remove = useMutation({
    mutationFn: () => apiSend(`/api/employees/${userId}/avatar`, "DELETE"),
    onSuccess: () => { setPreview(null); toast.success("Profile picture removed"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(file: File | undefined) {
    if (!file) return;
    // Check client-side too so an obvious mistake fails instantly; the server
    // re-validates by magic bytes regardless.
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`);
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload.mutate(file);
  }

  const busy = upload.isPending || remove.isPending;
  const shown = preview ?? avatarUrl ?? null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <Avatar firstName={firstName} lastName={lastName} src={shown} size={size} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change profile picture"
          className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </button>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl && !preview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => remove.mutate()}
              disabled={busy}
            >
              <Trash2 className="size-3.5" /> Remove
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF · up to 2 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Reset so re-picking the same file still fires a change event.
          e.target.value = "";
        }}
      />
    </div>
  );
}
