import "server-only";
import { db } from "./db";
import { deadlineDueBy } from "./tasks";

/**
 * Employee of the Month — weighted scoring engine.
 * Weights are configurable via EotmConfig. Each component is normalized to 0–100,
 * then combined by weight. Winner = highest total (unless a manager overrides).
 */

export type ScoreBreakdown = {
  userId: string;
  taskCompletion: number;
  deadline: number;
  quality: number;
  attendance: number;
  collaboration: number;
  initiative: number;
  total: number;
};

export async function getConfig() {
  let cfg = await db.eotmConfig.findFirst();
  if (!cfg) cfg = await db.eotmConfig.create({ data: {} });
  return cfg;
}

/** Compute scores for a period ("YYYY-MM") across all active employees. */
export async function computeScores(period: string): Promise<ScoreBreakdown[]> {
  const cfg = await getConfig();
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const users = await db.user.findMany({
    where: { status: { in: ["ACTIVE", "OFFBOARDING"] } },
    select: { id: true },
  });

  // Compute each user's score. Metric queries for a user run in parallel, but
  // users are processed in small batches so we never exhaust the connection
  // pool (serverless Postgres keeps a small pool). This balances speed against
  // pool limits — far faster than fully sequential, safe under `connection_limit`.
  const scoreOne = async (u: { id: string }): Promise<ScoreBreakdown> => {
    const [assigned, completed, doneTasks, reviews, attendanceRows, comments, created, achievements] =
      await Promise.all([
        db.task.count({ where: { assignees: { some: { userId: u.id } }, createdAt: { lt: end } } }),
        db.task.count({ where: { assignees: { some: { userId: u.id } }, status: "DONE", updatedAt: { gte: start, lt: end } } }),
        db.task.findMany({ where: { assignees: { some: { userId: u.id } }, status: "DONE", updatedAt: { gte: start, lt: end } }, select: { deadline: true, updatedAt: true } }),
        db.performanceReview.findMany({ where: { subjectId: u.id, period }, select: { qualityScore: true } }),
        db.attendance.findMany({ where: { userId: u.id, date: { gte: start, lt: end } }, select: { status: true, late: true } }),
        db.comment.count({ where: { authorId: u.id, createdAt: { gte: start, lt: end } } }),
        db.task.count({ where: { createdById: u.id, createdAt: { gte: start, lt: end } } }),
        db.achievement.count({ where: { userId: u.id, awardedAt: { gte: start, lt: end } } }),
      ]);

    // task completion rate
    const taskCompletion = assigned ? Math.min(100, (completed / assigned) * 100) : 0;

    // deadline adherence: done tasks completed on/before deadline. A date-only
    // deadline means end of that day, so finishing during the due day is on time.
    const onTime = doneTasks.filter(
      (t) => !t.deadline || t.updatedAt <= deadlineDueBy(t.deadline)
    ).length;
    const deadline = doneTasks.length ? (onTime / doneTasks.length) * 100 : (completed ? 100 : 0);

    // quality: average manager review score for the period
    const quality = reviews.length ? reviews.reduce((s, r) => s + r.qualityScore, 0) / reviews.length : 70;

    // attendance & punctuality
    let attendance = 90;
    if (attendanceRows.length) {
      const present = attendanceRows.filter((a) => a.status === "present" || a.status === "remote").length;
      const late = attendanceRows.filter((a) => a.late).length;
      attendance = Math.max(0, (present / attendanceRows.length) * 100 - late * 5);
    }

    // collaboration: comments authored (peer signal)
    const collaboration = Math.min(100, comments * 8 + 40);

    // initiative: tasks the user created + achievements
    const initiative = Math.min(100, created * 10 + achievements * 20 + 30);

    const total =
      (taskCompletion * cfg.taskCompletionWeight +
        deadline * cfg.deadlineWeight +
        quality * cfg.qualityWeight +
        attendance * cfg.attendanceWeight +
        collaboration * cfg.collaborationWeight +
        initiative * cfg.initiativeWeight) /
      (cfg.taskCompletionWeight + cfg.deadlineWeight + cfg.qualityWeight +
        cfg.attendanceWeight + cfg.collaborationWeight + cfg.initiativeWeight);

    return {
      userId: u.id,
      taskCompletion: round(taskCompletion),
      deadline: round(deadline),
      quality: round(quality),
      attendance: round(attendance),
      collaboration: round(collaboration),
      initiative: round(initiative),
      total: round(total),
    };
  };

  // bounded concurrency: 3 users at a time (≈ up to 24 concurrent queries,
  // below any reasonable pool ceiling with headroom for other requests)
  const results: ScoreBreakdown[] = [];
  const BATCH = 3;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    results.push(...(await Promise.all(batch.map(scoreOne))));
  }

  return results.sort((a, b) => b.total - a.total);
}

/** Compute and persist scores + set (or refresh) the auto winner. */
export async function recomputeAndStore(period: string) {
  const scores = await computeScores(period);
  const BATCH = 4;
  for (let i = 0; i < scores.length; i += BATCH) {
    const batch = scores.slice(i, i + BATCH);
    await Promise.all(batch.map((s) =>
      db.eotmScore.upsert({
        where: { userId_period: { userId: s.userId, period } },
        update: s,
        create: { period, ...s },
      })
    ));
  }
  // set auto winner unless an override exists
  const existing = await db.eotmWinner.findUnique({ where: { period } });
  if (scores.length && (!existing || !existing.overridden)) {
    const top = scores[0];
    await db.eotmWinner.upsert({
      where: { period },
      update: { userId: top.userId, total: top.total, overridden: false },
      create: { period, userId: top.userId, total: top.total },
    });
  }
  return scores;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
