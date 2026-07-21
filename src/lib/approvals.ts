import "server-only";
import { db } from "./db";
import { notifyMany, notify } from "./notify";
import type { ApprovalKind, RoleKey } from "@prisma/client";

/**
 * Generic multi-step approval engine.
 *
 * Elenor workflow: Employee → Direct Manager → Operations Manager → (CEO optional).
 * Steps are created when a request is submitted; each step is decided in order.
 */

export type StepPlan = { order: number; roleKey?: RoleKey; approverId?: string };

/** Build the standard approval chain for a requester. */
export async function buildApprovalChain(requesterId: string, opts?: { includeCeo?: boolean }): Promise<StepPlan[]> {
  const requester = await db.user.findUnique({
    where: { id: requesterId },
    include: { manager: true },
  });
  const steps: StepPlan[] = [];
  let order = 1;

  // 1) direct manager (if any and not the requester)
  if (requester?.managerId && requester.managerId !== requesterId) {
    steps.push({ order: order++, approverId: requester.managerId });
  }

  // 2) operations manager (by role) — dedupe if manager already is ops
  const ops = await db.user.findFirst({
    where: { role: { key: "OPERATIONS_MANAGER" }, status: "ACTIVE" },
  });
  if (ops && ops.id !== requester?.managerId && ops.id !== requesterId) {
    steps.push({ order: order++, approverId: ops.id, roleKey: "OPERATIONS_MANAGER" });
  }

  // 3) CEO (optional, e.g. resignations)
  if (opts?.includeCeo) {
    const ceo = await db.user.findFirst({ where: { role: { key: "CEO" }, status: "ACTIVE" } });
    if (ceo && ceo.id !== requesterId) steps.push({ order: order++, approverId: ceo.id, roleKey: "CEO" });
  }

  // if no approvers resolved (e.g. CEO submitting), auto-approve via empty chain
  return steps;
}

export async function createApprovalSteps(kind: ApprovalKind, entityId: string, plan: StepPlan[]) {
  if (!plan.length) return;
  await db.approvalStep.createMany({
    data: plan.map((s) => ({ kind, entityId, order: s.order, approverId: s.approverId, roleKey: s.roleKey })),
  });
  // notify the first approver
  const first = plan[0];
  if (first.approverId) {
    await notify({
      userId: first.approverId,
      type: "APPROVAL_REQUIRED",
      title: "Approval required",
      body: `A ${kind.toLowerCase()} request needs your review.`,
      link: approvalLink(kind),
    });
  }
}

export function approvalLink(kind: ApprovalKind) {
  switch (kind) {
    case "LEAVE": return "/leave";
    case "PERMISSION": return "/permissions";
    case "RESIGNATION": return "/approvals";
    default: return "/approvals";
  }
}

/** Steps for an entity, ordered. */
export async function getSteps(kind: ApprovalKind, entityId: string) {
  return db.approvalStep.findMany({
    where: { kind, entityId },
    orderBy: { order: "asc" },
    include: { approver: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  });
}

/** Can this user act on the current pending step? */
export async function currentPendingStep(kind: ApprovalKind, entityId: string) {
  return db.approvalStep.findFirst({
    where: { kind, entityId, decision: "PENDING" },
    orderBy: { order: "asc" },
  });
}

export type DecisionResult = "APPROVED" | "REJECTED" | "ADVANCED";

/**
 * Apply a decision to the current step. Returns overall outcome.
 * - REJECTED short-circuits the whole request.
 * - APPROVED on the last step finalizes as APPROVED.
 * - APPROVED on a middle step advances and notifies the next approver.
 */
export async function decideStep(opts: {
  kind: ApprovalKind;
  entityId: string;
  actorId: string;
  approve: boolean;
  comment?: string;
}): Promise<DecisionResult> {
  const step = await currentPendingStep(opts.kind, opts.entityId);
  if (!step) throw new Error("No pending approval step");

  // authorization: assigned approver, or a super-admin acting on the step's role
  const actor = await db.user.findUnique({ where: { id: opts.actorId }, include: { role: true } });
  const authorized =
    step.approverId === opts.actorId ||
    (step.roleKey && actor?.role.key === step.roleKey) ||
    actor?.role.isSuperAdmin;
  if (!authorized) throw new Error("You are not authorized to decide this step");

  await db.approvalStep.update({
    where: { id: step.id },
    data: {
      decision: opts.approve ? "APPROVED" : "REJECTED",
      approverId: opts.actorId,
      comment: opts.comment,
      decidedAt: new Date(),
    },
  });

  if (!opts.approve) return "REJECTED";

  const next = await currentPendingStep(opts.kind, opts.entityId);
  if (next?.approverId) {
    await notify({
      userId: next.approverId,
      type: "APPROVAL_REQUIRED",
      title: "Approval required",
      body: `A ${opts.kind.toLowerCase()} request needs your review.`,
      link: approvalLink(opts.kind),
    });
    return "ADVANCED";
  }
  return "APPROVED";
}
