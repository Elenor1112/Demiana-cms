"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, SectionCard, EmptyState } from "@/components/sales/sales-bits";
import { formatCompactMoney, formatMoney } from "@/lib/sales-constants";

type TeamRow = {
  userId: string; name: string; avatarUrl: string | null;
  jobTitle: string | null; roleName: string;
  meetings: number; pipelineValue: number; forecast: number; openLeads: number;
  dealsWon: number; dealsLost: number; conversionRate: number;
  avgDealSize: number; revenueClosed: number; activities: number;
  followUpCompletion: number; proposalsSent: number; proposalsAccepted: number;
};

type TeamData = {
  team: TeamRow[];
  leaderboard: TeamRow[];
  totals: {
    pipelineValue: number; revenueClosed: number;
    dealsWon: number; dealsLost: number; meetings: number;
  };
};

/** Medal colours for the top three; everyone else gets a plain rank. */
const MEDALS = ["#F59E0B", "#94A3B8", "#B45309"];

export function TeamClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-team"],
    queryFn: () => apiGet<TeamData>("/api/sales/team"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!data.team.length) {
    return (
      <EmptyState
        icon="UsersRound"
        title="No sales team members"
        description="Grant someone the Sales.View permission to see them here."
      />
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Team pipeline" value={formatCompactMoney(t.pipelineValue)} icon="Filter" color="#8B5CF6" />
        <StatTile label="Revenue closed" value={formatCompactMoney(t.revenueClosed)} icon="Wallet" color="#22C55E" />
        <StatTile label="Deals won" value={t.dealsWon} hint={`${t.dealsLost} lost`} icon="Trophy" color="#06B6D4" />
        <StatTile label="Meetings held" value={t.meetings} icon="CalendarCheck" color="#F59E0B" />
      </div>

      <SectionCard title="Leaderboard" description="Ranked by revenue closed.">
        <div className="space-y-2">
          {data.leaderboard.slice(0, 5).map((m, i) => (
            <motion.div
              key={m.userId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={
                  i < 3
                    ? { backgroundColor: `${MEDALS[i]}1A`, color: MEDALS[i] }
                    : { backgroundColor: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {i < 3 ? <Trophy className="size-4" /> : i + 1}
              </span>
              <Avatar
                firstName={m.name.split(" ")[0]}
                lastName={m.name.split(" ").slice(1).join(" ")}
                src={m.avatarUrl}
                size={34}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.jobTitle ?? m.roleName}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{formatCompactMoney(m.revenueClosed)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {m.dealsWon} won · {m.conversionRate}%
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Full team" description="Every metric per salesperson.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border text-left">
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-semibold">Salesperson</th>
                <th className="pb-2 text-right font-semibold">Meetings</th>
                <th className="pb-2 text-right font-semibold">Pipeline</th>
                <th className="pb-2 text-right font-semibold">Won</th>
                <th className="pb-2 text-right font-semibold">Lost</th>
                <th className="pb-2 text-right font-semibold">Conv.</th>
                <th className="pb-2 text-right font-semibold">Avg deal</th>
                <th className="pb-2 text-right font-semibold">Revenue</th>
                <th className="pb-2 text-right font-semibold">Activities</th>
                <th className="pb-2 text-right font-semibold">Follow-ups</th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar
                        firstName={m.name.split(" ")[0]}
                        lastName={m.name.split(" ").slice(1).join(" ")}
                        src={m.avatarUrl}
                        size={26}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {m.jobTitle ?? m.roleName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{m.meetings}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatCompactMoney(m.pipelineValue)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{m.dealsWon}</td>
                  <td className="py-2.5 text-right tabular-nums">{m.dealsLost}</td>
                  <td className="py-2.5 text-right tabular-nums">{m.conversionRate}%</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatCompactMoney(m.avgDealSize)}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {formatMoney(m.revenueClosed)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{m.activities}</td>
                  <td className="py-2.5 text-right">
                    {/* Follow-up completion is the discipline metric — colour it
                        so a slipping number is visible at a glance. */}
                    <Badge
                      color={
                        m.followUpCompletion >= 90 ? "#22C55E"
                        : m.followUpCompletion >= 70 ? "#F59E0B"
                        : "#EF4444"
                      }
                    >
                      {m.followUpCompletion}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
