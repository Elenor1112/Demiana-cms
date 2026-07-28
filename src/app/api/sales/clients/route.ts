import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { salesScope } from "@/lib/rbac";
import { leadVisibilityFilter } from "@/lib/sales";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * Clients that came through the sales pipeline.
 *
 * Distinct from /api/clients, which lists every client the agency has: this one
 * is the sales view, keyed on the originating lead so the discovery brief,
 * feedback and proposal history stay one click away after the handover.
 *
 * Access works for BOTH sides of that handover — a sales member sees the
 * accounts they closed (their leads), while Account Management sees converted
 * accounts through the `converted` scope. Both resolve through the same lead
 * visibility filter.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const visibility = leadVisibilityFilter(user);
    const scope = salesScope(user);
    const q = req.nextUrl.searchParams.get("q")?.trim();

    const where: Prisma.LeadWhereInput = {
      AND: [
        ...(visibility ? [visibility] : []),
        { convertedClientId: { not: null } },
        ...(q
          ? [{
              OR: [
                { companyName: { contains: q, mode: "insensitive" as const } },
                { code: { contains: q, mode: "insensitive" as const } },
                { contactPerson: { contains: q, mode: "insensitive" as const } },
              ],
            }]
          : []),
      ],
    };

    const leads = await db.lead.findMany({
      where,
      select: {
        id: true, code: true, companyName: true, brandName: true, industry: true,
        contactPerson: true, email: true, phone: true, estimatedValue: true,
        wonAt: true, convertedAt: true, source: true,
        owner: userPick,
        convertedClient: {
          select: {
            id: true, company: true, status: true, industry: true,
            accountManager: userPick,
            _count: { select: { projects: true, tasks: true } },
            projects: {
              select: { id: true, name: true, status: true, deadline: true },
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        },
        _count: { select: { briefs: true, feedback: true, proposals: true, meetings: true } },
      },
      orderBy: { convertedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      clients: leads.map((l) => ({
        ...l,
        estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
      })),
      scope: scope.kind,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
