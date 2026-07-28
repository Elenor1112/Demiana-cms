"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { LeadStage } from "@prisma/client";

/**
 * Dropdown data and effective permissions for the Sales workspace.
 *
 * One shared query key means every dialog and page reads from the same cache,
 * so opening five forms costs one request — the pattern the task-meta query
 * already established.
 */

export type SalesMeta = {
  salespeople: {
    id: string; firstName: string; lastName: string;
    avatarUrl: string | null; jobTitle: string | null;
  }[];
  users: {
    id: string; firstName: string; lastName: string;
    avatarUrl: string | null; jobTitle: string | null;
    role: { key: string };
  }[];
  clients: { id: string; company: string }[];
  leads: { id: string; code: string; companyName: string; stage: LeadStage }[];
  tags: string[];
  scope: "all" | "own" | "converted" | "none";
  permissions: {
    canAssign: boolean;
    canConvert: boolean;
    canDelete: boolean;
    canChangeStage: boolean;
    canManageMeetings: boolean;
    canSubmitDiscovery: boolean;
    canSubmitFeedback: boolean;
    canManageProposals: boolean;
    canViewTeam: boolean;
    canViewReports: boolean;
  };
};

export function useSalesMeta() {
  return useQuery({
    queryKey: ["sales-meta"],
    queryFn: () => apiGet<SalesMeta>("/api/sales/meta"),
    // Dropdown contents change rarely; five minutes avoids refetching on every
    // dialog open without going stale for a working session.
    staleTime: 5 * 60_000,
  });
}
