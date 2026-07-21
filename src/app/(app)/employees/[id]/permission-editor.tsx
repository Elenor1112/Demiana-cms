"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Minus } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Row = {
  key: string;
  description: string;
  group: string;
  fromRole: boolean;
  override: "ALLOW" | "DENY" | null;
  effective: boolean;
};

export function PermissionEditor({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["permissions", userId],
    queryFn: () => apiGet<{ matrix: Row[]; isSuperAdmin: boolean; roleKey: string }>(`/api/employees/${userId}/permissions`),
  });

  const mutation = useMutation({
    mutationFn: (v: { permissionKey: string; effect: "ALLOW" | "DENY" | "INHERIT" }) =>
      apiSend(`/api/employees/${userId}/permissions`, "PATCH", v),
    onMutate: () => {},
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!data) return null;

  if (data.isSuperAdmin) {
    return (
      <Card className="flex items-center gap-3 p-6">
        <ShieldCheck className="size-6 text-primary" />
        <div>
          <div className="font-medium">Super Administrator</div>
          <div className="text-sm text-muted-foreground">
            This role has full access to every permission. Overrides don&apos;t apply.
          </div>
        </div>
      </Card>
    );
  }

  const groups = Array.from(new Set(data.matrix.map((r) => r.group)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Permissions inherited from the role are shown as <span className="font-medium">Role</span>. Override any
        permission with <span className="text-success">Allow</span> or <span className="text-destructive">Deny</span> for this user only.
      </p>
      {groups.map((group) => (
        <Card key={group} className="overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-4 py-2.5 text-sm font-semibold">{group}</div>
          <div className="divide-y divide-border">
            {data.matrix.filter((r) => r.group === group).map((r) => (
              <div key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
                    {r.effective ? (
                      <Badge color="#22C55E" className="text-[10px]">Effective</Badge>
                    ) : (
                      <Badge color="#EF4444" className="text-[10px]">Blocked</Badge>
                    )}
                  </div>
                  <div className="truncate text-sm">{r.description}</div>
                </div>
                <Segmented
                  value={r.override ?? "INHERIT"}
                  fromRole={r.fromRole}
                  onChange={(effect) => mutation.mutate({ permissionKey: r.key, effect })}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Segmented({
  value,
  fromRole,
  onChange,
}: {
  value: "ALLOW" | "DENY" | "INHERIT";
  fromRole: boolean;
  onChange: (v: "ALLOW" | "DENY" | "INHERIT") => void;
}) {
  const opts = [
    { key: "ALLOW" as const, icon: Check, label: "Allow", active: "bg-success text-white" },
    { key: "INHERIT" as const, icon: Minus, label: fromRole ? "Role ✓" : "Role ✗", active: "bg-secondary text-foreground" },
    { key: "DENY" as const, icon: X, label: "Deny", active: "bg-destructive text-white" },
  ];
  return (
    <div className="flex items-center rounded-lg border border-border p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          title={o.label}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            value === o.key ? o.active : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <o.icon className="size-3" />
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
