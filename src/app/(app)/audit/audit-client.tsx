"use client";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatExactDateTime } from "@/lib/utils";

const ACTION_COLOR: Record<string, string> = {
  create: "#22C55E", update: "#0EA5E9", delete: "#EF4444", deactivate: "#EF4444",
  approve: "#22C55E", reject: "#EF4444", login: "#64748B", override: "#8B5CF6",
};

function colorFor(action: string) {
  const key = Object.keys(ACTION_COLOR).find((k) => action.includes(k));
  return key ? ACTION_COLOR[key] : "#64748B";
}

export function AuditClient() {
  const { data, isLoading } = useQuery({ queryKey: ["audit"], queryFn: () => apiGet<any>("/api/audit") });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;

  if (!data?.logs.length) {
    return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center"><ScrollText className="size-9 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">No audit entries yet.</p></div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Actor</th>
            <th className="px-4 py-2.5 font-medium">Action</th>
            <th className="px-4 py-2.5 font-medium">Entity</th>
            <th className="px-4 py-2.5 font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.logs.map((log: any) => (
            <tr key={log.id} className="hover:bg-accent/30">
              <td className="px-4 py-2.5">
                {log.actor ? (
                  <div className="flex items-center gap-2">
                    <Avatar firstName={log.actor.firstName} lastName={log.actor.lastName} src={log.actor.avatarUrl} size={26} />
                    <span>{log.actor.firstName} {log.actor.lastName}</span>
                  </div>
                ) : <span className="text-muted-foreground">System</span>}
              </td>
              <td className="px-4 py-2.5"><Badge color={colorFor(log.action)}>{log.action}</Badge></td>
              <td className="px-4 py-2.5 text-muted-foreground">{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatExactDateTime(log.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
