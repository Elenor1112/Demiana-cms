"use client";
import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState, Icon, StageBadge, formatDateTime, formatRelative, type PersonRef,
} from "@/components/sales/sales-bits";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import { SALES_ACTIVITY_META, DEFAULT_ACTIVITY_META } from "@/lib/sales-constants";
import type { LeadStage } from "@prisma/client";

type ActivityRow = {
  id: string; verb: string; summary: string | null; createdAt: string;
  actor: PersonRef | null;
  lead: { id: string; code: string; companyName: string; stage: LeadStage };
};

export function ActivitiesClient() {
  const { data: meta } = useSalesMeta();
  const [verb, setVerb] = React.useState("");
  const [actor, setActor] = React.useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["sales-activities", verb, actor],
      queryFn: ({ pageParam }) => {
        const qp = new URLSearchParams();
        if (verb) qp.set("verb", verb);
        if (actor) qp.set("actor", actor);
        if (pageParam) qp.set("cursor", pageParam as string);
        return apiGet<{ activities: ActivityRow[]; nextCursor: string | null }>(
          `/api/sales/activities?${qp.toString()}`
        );
      },
      initialPageParam: null as string | null,
      // Cursor pagination: the feed is append-heavy, so an offset would shift
      // under inserts and duplicate rows across pages.
      getNextPageParam: (last) => last.nextCursor,
    });

  const activities = data?.pages.flatMap((p) => p.activities) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={verb} onChange={(e) => setVerb(e.target.value)} className="w-56">
          <option value="">All activity</option>
          {Object.entries(SALES_ACTIVITY_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        {meta?.scope === "all" && (
          <Select value={actor} onChange={(e) => setActor(e.target.value)} className="w-48">
            <option value="">Anyone</option>
            {meta.salespeople.map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="Activity" title="No activity" description="Nothing matches these filters." />
        </div>
      ) : (
        <>
          <Card className="mt-4 p-5">
            <ol className="relative space-y-4 border-l border-border pl-6">
              {activities.map((a) => {
                const m = SALES_ACTIVITY_META[a.verb] ?? DEFAULT_ACTIVITY_META;
                return (
                  <li key={a.id} className="relative">
                    <span
                      className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full ring-4 ring-card"
                      style={{ backgroundColor: `${m.color}1A`, color: m.color }}
                    >
                      <Icon name={m.icon} className="size-3" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{m.label}</span>
                      <Link
                        href={`/sales/leads/${a.lead.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {a.lead.companyName}
                      </Link>
                      <StageBadge stage={a.lead.stage} />
                    </div>
                    {a.summary && (
                      <div className="mt-0.5 text-sm text-muted-foreground">{a.summary}</div>
                    )}
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {a.actor && (
                        <span className="flex items-center gap-1">
                          <Avatar
                            firstName={a.actor.firstName}
                            lastName={a.actor.lastName}
                            src={a.actor.avatarUrl}
                            size={16}
                          />
                          {a.actor.firstName} {a.actor.lastName}
                        </span>
                      )}
                      <span>{formatDateTime(a.createdAt)}</span>
                      <span>· {formatRelative(a.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
