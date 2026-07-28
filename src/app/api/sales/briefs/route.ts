import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { leadVisibilityFilter, requireSalesModule } from "@/lib/sales";
import type { BriefStatus } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * Discovery briefs across every visible lead.
 *
 * The index view; a single lead's briefs come from
 * /api/sales/leads/[id]/brief, which is also where they are written.
 */
export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") as BriefStatus | null;
    const q = sp.get("q")?.trim();

    const briefs = await db.discoveryBrief.findMany({
      where: {
        ...(visibility ? { lead: visibility } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { companyName: { contains: q, mode: "insensitive" } },
                { lead: { companyName: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: {
        id: true, status: true, submittedAt: true, createdAt: true, updatedAt: true,
        companyName: true, industry: true,
        marketingGoals: true, servicesRequested: true, successMetrics: true,
        submittedBy: userPick,
        lead: { select: { id: true, code: true, companyName: true, stage: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ briefs });
  } catch (e) {
    return toErrorResponse(e);
  }
}
