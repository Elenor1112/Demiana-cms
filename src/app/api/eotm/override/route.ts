import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, audit, toErrorResponse } from "@/lib/api";
import { notify } from "@/lib/notify";

const schema = z.object({
  period: z.string(),
  userId: z.string(),
  justification: z.string().min(3),
  reward: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("Eotm.Manage");
    const data = schema.parse(await req.json());
    const score = await db.eotmScore.findUnique({ where: { userId_period: { userId: data.userId, period: data.period } } });

    const winner = await db.eotmWinner.upsert({
      where: { period: data.period },
      update: { userId: data.userId, total: score?.total ?? 0, overridden: true, justification: data.justification, reward: data.reward },
      create: { period: data.period, userId: data.userId, total: score?.total ?? 0, overridden: true, justification: data.justification, reward: data.reward },
    });

    // award achievement + notify
    await db.achievement.create({
      data: { userId: data.userId, badge: "eotm", title: `Employee of the Month — ${data.period}` },
    });
    await notify({
      userId: data.userId,
      type: "EOTM",
      title: "You're Employee of the Month! 🏆",
      body: data.reward ? `Reward: ${data.reward}` : "Congratulations on your recognition.",
      link: "/eotm",
    });

    await audit({ actorId: actor.id, action: "eotm.override", entity: "eotm", entityId: winner.id, newValue: { userId: data.userId, justification: data.justification } });
    return NextResponse.json({ winner });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const cfgSchema = z.object({
  taskCompletionWeight: z.number().int().min(0).max(100),
  deadlineWeight: z.number().int().min(0).max(100),
  qualityWeight: z.number().int().min(0).max(100),
  attendanceWeight: z.number().int().min(0).max(100),
  collaborationWeight: z.number().int().min(0).max(100),
  initiativeWeight: z.number().int().min(0).max(100),
});

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requirePermission("Eotm.Manage");
    const data = cfgSchema.parse(await req.json());
    const existing = await db.eotmConfig.findFirst();
    const cfg = existing
      ? await db.eotmConfig.update({ where: { id: existing.id }, data })
      : await db.eotmConfig.create({ data });
    await audit({ actorId: actor.id, action: "eotm.config", entity: "eotm", newValue: data });
    return NextResponse.json({ config: cfg });
  } catch (e) {
    return toErrorResponse(e);
  }
}
