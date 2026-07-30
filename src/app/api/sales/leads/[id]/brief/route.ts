import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import {
  leadVisibilityFilter, assertCanEditLead, logSalesActivity, SALES_ACTIVITY, notifySales, requireSalesModule,
} from "@/lib/sales";
import { briefSchema } from "@/lib/sales-schemas";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/** Enough of the linked meeting to label it in the UI, without its full payload. */
const meetingPick = {
  select: { id: true, title: true, type: true, scheduledAt: true, status: true },
};

/**
 * The discovery brief is edited as a single upsert rather than created and then
 * patched: the form is one long page, saved as a draft repeatedly and finally
 * submitted, so "create if missing, otherwise update" is the only operation the
 * UI ever needs.
 *
 * A lead may hold several briefs over its life (a re-brief after a pivot); this
 * route always targets the most recent one unless `?new=1` forces a fresh sheet.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, ...leadVisibilityFilter(user) },
      select: {
        id: true, code: true, companyName: true, brandName: true, industry: true,
        website: true, contactPerson: true, jobTitle: true, phone: true, email: true,
        ownerId: true, createdById: true, stage: true,
      },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");
    assertCanEditLead(user, lead, "Sales.DiscoverySubmit");

    const body = briefSchema.parse(await req.json());
    const forceNew = req.nextUrl.searchParams.get("new") === "1";
    const now = new Date();

    // A brief may only cite a meeting on its OWN lead. Checked here rather than
    // trusted from the client, so a crafted meetingId cannot attach a brief to
    // another lead's meeting.
    if (body.meetingId) {
      const meeting = await db.salesMeeting.findFirst({
        where: { id: body.meetingId, leadId: id },
        select: { id: true },
      });
      if (!meeting) throw new ApiError(400, "That meeting does not belong to this lead.");
    }

    const existing = forceNew
      ? null
      : await db.discoveryBrief.findFirst({
          where: { leadId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true },
        });

    const submitting = body.status === "SUBMITTED";

    // Company details default to whatever the lead already knows, so the form
    // opens pre-filled instead of asking for the same facts twice.
    const data: Prisma.DiscoveryBriefUncheckedCreateInput = {
      leadId: id,
      status: body.status ?? "DRAFT",
      companyName: body.companyName ?? lead.companyName,
      brandName: body.brandName ?? lead.brandName,
      industry: body.industry ?? lead.industry,
      website: body.website ?? lead.website,
      contactPerson: body.contactPerson ?? lead.contactPerson,
      jobTitle: body.jobTitle ?? lead.jobTitle,
      phone: body.phone ?? lead.phone,
      email: body.email ?? lead.email,
      socialMedia: body.socialMedia as object | undefined,
      businessDescription: body.businessDescription,
      products: body.products,
      services: body.services,
      usp: body.usp,
      mission: body.mission,
      vision: body.vision,
      marketingGoals: body.marketingGoals ?? [],
      goalsOther: body.goalsOther,
      audienceAge: body.audienceAge,
      audienceGender: body.audienceGender,
      audienceLocation: body.audienceLocation,
      audienceIncome: body.audienceIncome,
      audienceInterests: body.audienceInterests,
      audiencePainPoints: body.audiencePainPoints,
      audienceBuyingBehavior: body.audienceBuyingBehavior,
      topCompetitors: body.topCompetitors,
      brandsAdmired: body.brandsAdmired,
      competitiveAdvantages: body.competitiveAdvantages,
      weaknesses: body.weaknesses,
      channelsUsed: body.channelsUsed ?? [],
      marketingBudget: body.marketingBudget,
      previousAgency: body.previousAgency,
      currentChallenges: body.currentChallenges,
      brandPersonality: body.brandPersonality,
      assetLogo: body.assetLogo ?? false,
      assetBrandGuidelines: body.assetBrandGuidelines ?? false,
      assetPhotos: body.assetPhotos ?? false,
      assetVideos: body.assetVideos ?? false,
      assetContentLibrary: body.assetContentLibrary ?? false,
      assetWebsite: body.assetWebsite ?? false,
      assetNotes: body.assetNotes,
      servicesRequested: body.servicesRequested ?? [],
      servicesOther: body.servicesOther,
      successMetrics: body.successMetrics ?? [],
      metricsOther: body.metricsOther,
      additionalNotes: body.additionalNotes,
      // Absent key means "leave the existing link alone"; an explicit null
      // clears it. The Discovery tab does not send this field at all, so its
      // draft saves must not wipe a link made from the Discovery page.
      ...("meetingId" in body ? { meetingId: body.meetingId ?? null } : {}),
      ...(submitting ? { submittedById: user.id, submittedAt: now } : {}),
    };

    const brief = existing
      ? await db.discoveryBrief.update({
          where: { id: existing.id },
          // leadId is immutable on update — stripping it keeps the type honest.
          data: { ...data, leadId: undefined },
          include: { submittedBy: userPick, meeting: meetingPick },
        })
      : await db.discoveryBrief.create({
          data,
          include: { submittedBy: userPick, meeting: meetingPick },
        });

    // Submitting for the first time is what moves the lead into DISCOVERY.
    const firstSubmission = submitting && existing?.status !== "SUBMITTED";
    if (firstSubmission) {
      if (["NEW", "CONTACTED", "QUALIFIED", "MEETING_SCHEDULED"].includes(lead.stage)) {
        await db.lead.update({ where: { id }, data: { stage: "DISCOVERY", probability: 45 } });
        await db.leadStageChange.create({
          data: { leadId: id, fromStage: lead.stage, toStage: "DISCOVERY", actorId: user.id, changedAt: now },
        });
      }
      await logSalesActivity({
        leadId: id, actorId: user.id, verb: SALES_ACTIVITY.DISCOVERY_SUBMITTED,
        summary: `Discovery brief submitted for ${lead.companyName}`,
        meta: { briefId: brief.id }, at: now,
      });
      await notifySales({
        ownerId: lead.ownerId, excludeActorId: user.id,
        type: "PROJECT_UPDATED",
        title: `Discovery brief submitted — ${lead.companyName}`,
        body: `${user.firstName} ${user.lastName} submitted the discovery brief.`,
        link: `/sales/leads/${id}`,
        meta: { leadId: id, briefId: brief.id },
      });
    }

    await audit({
      actorId: user.id,
      action: existing ? "sales.brief.update" : "sales.brief.create",
      entity: "discoveryBrief", entityId: brief.id,
      newValue: { leadId: id, status: brief.status },
    });

    return NextResponse.json({ brief }, { status: existing ? 200 : 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const lead = await db.lead.findFirst({
      where: { id, ...leadVisibilityFilter(user) },
      select: { id: true },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");

    const briefs = await db.discoveryBrief.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
      include: {
        submittedBy: userPick,
        meeting: meetingPick,
        attachments: {
          select: {
            id: true, name: true, mimeType: true, size: true, isVoiceNote: true, createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ briefs });
  } catch (e) {
    return toErrorResponse(e);
  }
}
