import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { can, canSeeSalesModule } from "@/lib/rbac";
import { taskVisibilityFilter } from "@/lib/tasks";
import { leadVisibilityFilter } from "@/lib/sales";

/**
 * Global search across every entity the caller is allowed to see.
 *
 * Each entity is searched under its OWN visibility rule — tasks through
 * taskVisibilityFilter, leads through leadVisibilityFilter — so this endpoint
 * can never widen access that the dedicated list routes would deny. Entities
 * the user lacks permission for are skipped entirely rather than queried and
 * filtered afterwards.
 */

export type SearchHit = {
  type: "lead" | "client" | "contact" | "proposal" | "meeting" | "idea" | "task" | "project" | "employee";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ hits: [] });

    const like = { contains: q, mode: "insensitive" as const };
    // Per-entity cap: the palette shows a handful of each rather than 50 of one.
    const take = 5;
    const hits: SearchHit[] = [];

    // Sales ENTITIES are searchable only by people the Sales module exists for.
    // Deliberately canSeeSalesModule rather than salesScope: Account Management
    // holds a `converted` scope so it can open a client's closed-deal history
    // from the client record, but leads, proposals and meetings must never
    // surface in their global search results.
    const hasSales = canSeeSalesModule(user);
    // leadVisibilityFilter throws for users with no sales access, so it is only
    // evaluated once that has been established.
    const leadScope = hasSales ? leadVisibilityFilter(user) : undefined;

    const [leads, clients, proposals, meetings, ideas, tasks, projects, employees] =
      await Promise.all([
        hasSales
          ? db.lead.findMany({
              where: {
                ...(leadScope ?? {}),
                OR: [
                  { companyName: like }, { brandName: like }, { code: like },
                  { contactPerson: like }, { email: like },
                ],
              },
              select: {
                id: true, code: true, companyName: true, contactPerson: true, stage: true,
              },
              take,
              orderBy: { updatedAt: "desc" },
            })
          : [],
        can(user, "Client.View")
          ? db.client.findMany({
              where: {
                status: { not: "ARCHIVED" },
                // Matching on email is deliberately gone: a hit would confirm a
                // confidential address to someone the clients API masks it
                // from, turning search into an oracle for the very field the
                // restriction protects. Company and contact person are not
                // confidential, so they stay searchable for everyone.
                OR: [{ company: like }, { contactPerson: like }],
              },
              select: { id: true, company: true, contactPerson: true, industry: true },
              take,
              orderBy: { company: "asc" },
            })
          : [],
        hasSales
          ? db.proposal.findMany({
              where: {
                ...(leadScope ? { lead: leadScope } : {}),
                OR: [{ title: like }, { summary: like }],
              },
              select: {
                id: true, title: true, version: true, status: true,
                lead: { select: { id: true, companyName: true } },
              },
              take,
              orderBy: { updatedAt: "desc" },
            })
          : [],
        hasSales
          ? db.salesMeeting.findMany({
              where: {
                ...(leadScope ? { lead: leadScope } : {}),
                OR: [{ title: like }, { agenda: like }],
              },
              select: {
                id: true, title: true, scheduledAt: true, status: true,
                lead: { select: { id: true, companyName: true } },
              },
              take,
              orderBy: { scheduledAt: "desc" },
            })
          : [],
        // Ideas are a Sales entity, so they need the module as well as the
        // permission — Account Management holds Sales.IdeaManage on its own.
        hasSales && can(user, "Sales.IdeaManage")
          ? db.salesIdea.findMany({
              where: { OR: [{ title: like }, { description: like }, { category: like }] },
              select: { id: true, title: true, status: true, category: true },
              take,
              orderBy: { createdAt: "desc" },
            })
          : [],
        can(user, "Task.View")
          ? db.task.findMany({
              where: {
                ...taskVisibilityFilter(user),
                OR: [{ title: like }, { code: like }],
              },
              select: { id: true, code: true, title: true, status: true },
              take,
              orderBy: { updatedAt: "desc" },
            })
          : [],
        can(user, "Project.View")
          ? db.project.findMany({
              where: { OR: [{ name: like }, { description: like }] },
              select: {
                id: true, name: true, status: true,
                client: { select: { company: true } },
              },
              take,
              orderBy: { updatedAt: "desc" },
            })
          : [],
        can(user, "Employee.View")
          ? db.user.findMany({
              where: {
                status: { not: "DEACTIVATED" },
                OR: [{ firstName: like }, { lastName: like }, { email: like }, { jobTitle: like }],
              },
              select: {
                id: true, firstName: true, lastName: true, jobTitle: true, email: true,
              },
              take,
              orderBy: { firstName: "asc" },
            })
          : [],
      ]);

    for (const l of leads) {
      hits.push({
        type: "lead", id: l.id, title: l.companyName,
        subtitle: `${l.code} · ${l.stage.replace(/_/g, " ").toLowerCase()}`,
        href: `/sales/leads/${l.id}`,
      });
      // A contact match surfaces as its own hit so searching a person's name
      // finds the deal, which is how salespeople actually remember accounts.
      if (l.contactPerson && l.contactPerson.toLowerCase().includes(q.toLowerCase())) {
        hits.push({
          type: "contact", id: `${l.id}-contact`, title: l.contactPerson,
          subtitle: `Contact at ${l.companyName}`, href: `/sales/leads/${l.id}`,
        });
      }
    }
    for (const c of clients) {
      hits.push({
        type: "client", id: c.id, title: c.company,
        subtitle: c.contactPerson ?? c.industry ?? "Client",
        href: `/clients`,
      });
    }
    for (const p of proposals) {
      hits.push({
        type: "proposal", id: p.id, title: `${p.title} (v${p.version})`,
        subtitle: `${p.lead.companyName} · ${p.status.toLowerCase()}`,
        href: `/sales/leads/${p.lead.id}?tab=proposal`,
      });
    }
    for (const m of meetings) {
      hits.push({
        type: "meeting", id: m.id, title: m.title,
        subtitle: `${m.lead.companyName} · ${m.status.toLowerCase()}`,
        href: `/sales/meetings?meeting=${m.id}`,
      });
    }
    for (const i of ideas) {
      hits.push({
        type: "idea", id: i.id, title: i.title,
        subtitle: i.category ?? i.status.replace(/_/g, " ").toLowerCase(),
        href: `/sales/ideas?idea=${i.id}`,
      });
    }
    for (const t of tasks) {
      hits.push({
        type: "task", id: t.id, title: t.title,
        subtitle: `${t.code} · ${t.status.replace(/_/g, " ").toLowerCase()}`,
        href: `/tasks?task=${t.id}`,
      });
    }
    for (const p of projects) {
      hits.push({
        type: "project", id: p.id, title: p.name,
        subtitle: p.client?.company ?? p.status.toLowerCase(),
        href: `/projects/${p.id}`,
      });
    }
    for (const e of employees) {
      hits.push({
        type: "employee", id: e.id, title: `${e.firstName} ${e.lastName}`,
        subtitle: e.jobTitle ?? e.email,
        href: `/employees/${e.id}`,
      });
    }

    return NextResponse.json({ hits });
  } catch (e) {
    return toErrorResponse(e);
  }
}
