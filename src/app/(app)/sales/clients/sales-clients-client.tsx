"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Building2, ArrowRight, FolderKanban } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  EmptyState, CardGridSkeleton, StatTile, formatDate, type PersonRef,
} from "@/components/sales/sales-bits";
import { LEAD_SOURCE_META, formatCompactMoney } from "@/lib/sales-constants";
import type { LeadSource } from "@prisma/client";

type ClientRow = {
  id: string; code: string; companyName: string; brandName: string | null;
  industry: string | null; contactPerson: string | null; email: string | null;
  phone: string | null; estimatedValue: number | null;
  wonAt: string | null; convertedAt: string | null; source: LeadSource;
  owner: PersonRef | null;
  convertedClient: {
    id: string; company: string; status: string; industry: string | null;
    accountManager: PersonRef | null;
    _count: { projects: number; tasks: number };
    projects: { id: string; name: string; status: string; deadline: string | null }[];
  } | null;
  _count: { briefs: number; feedback: number; proposals: number; meetings: number };
};

export function SalesClientsClient() {
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-clients", debouncedQ],
    queryFn: () =>
      apiGet<{ clients: ClientRow[]; scope: string }>(
        `/api/sales/clients?q=${encodeURIComponent(debouncedQ)}`
      ),
  });

  const clients = data?.clients ?? [];
  const totalValue = clients.reduce((s, c) => s + (c.estimatedValue ?? 0), 0);
  const totalProjects = clients.reduce(
    (s, c) => s + (c.convertedClient?._count.projects ?? 0),
    0
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Converted clients" value={clients.length} icon="Handshake" color="#22C55E" />
        <StatTile label="Total deal value" value={formatCompactMoney(totalValue)} icon="Wallet" color="#06B6D4" />
        <StatTile label="Projects" value={totalProjects} icon="FolderKanban" color="#8B5CF6" />
        <StatTile
          label="Avg deal size"
          value={formatCompactMoney(clients.length ? totalValue / clients.length : 0)}
          icon="TrendingUp"
          color="#F59E0B"
        />
      </div>

      <div className="relative mt-4 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search converted clients…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-56" /></div>
      ) : clients.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="Handshake"
            title="No converted clients yet"
            description="When a won lead is converted, it appears here with its full sales history."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                    <Building2 className="size-5" />
                  </div>
                  <Badge color="#22C55E">
                    {c.convertedClient?.status ?? "ACTIVE"}
                  </Badge>
                </div>

                <h3 className="mt-3 truncate font-semibold">
                  {c.convertedClient?.company ?? c.companyName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {c.code}
                  {c.industry ? ` · ${c.industry}` : ""}
                </p>

                {c.contactPerson && <p className="mt-2 text-sm">{c.contactPerson}</p>}

                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-base font-bold">
                    {formatCompactMoney(c.estimatedValue)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    won {formatDate(c.wonAt)}
                  </span>
                </div>

                {/* Sales history is one link away rather than copied here — the
                    lead remains the record, which is why conversion links
                    rather than duplicates. */}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                  {c._count.briefs > 0 && <Badge>{c._count.briefs} brief{c._count.briefs > 1 ? "s" : ""}</Badge>}
                  {c._count.feedback > 0 && <Badge>{c._count.feedback} feedback</Badge>}
                  {c._count.proposals > 0 && <Badge>{c._count.proposals} proposal{c._count.proposals > 1 ? "s" : ""}</Badge>}
                  {c._count.meetings > 0 && <Badge>{c._count.meetings} meeting{c._count.meetings > 1 ? "s" : ""}</Badge>}
                </div>

                {c.convertedClient?.projects.length ? (
                  <div className="mt-3 space-y-1">
                    {c.convertedClient.projects.slice(0, 2).map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                      >
                        <FolderKanban className="size-3 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  {c.convertedClient?.accountManager ? (
                    <>
                      <Avatar
                        firstName={c.convertedClient.accountManager.firstName}
                        lastName={c.convertedClient.accountManager.lastName}
                        src={c.convertedClient.accountManager.avatarUrl}
                        size={20}
                      />
                      <span className="truncate">
                        {c.convertedClient.accountManager.firstName}
                      </span>
                    </>
                  ) : (
                    <span>No account manager</span>
                  )}
                  <Link
                    href={`/sales/leads/${c.id}`}
                    className="ml-auto flex items-center gap-1 text-primary hover:underline"
                  >
                    Sales history <ArrowRight className="size-3" />
                  </Link>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
