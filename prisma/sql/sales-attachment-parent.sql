-- ============================================================
-- SalesAttachment: exactly one parent
--
-- SalesAttachment is polymorphic across the five sales objects that can carry
-- files (lead, meeting, discovery brief, feedback, proposal). It uses five
-- nullable foreign keys rather than a (entityType, entityId) pair so that
-- referential integrity and ON DELETE CASCADE remain real database guarantees
-- instead of application conventions.
--
-- The cost of that choice is that the shape "exactly one parent is set" is not
-- expressible in the Prisma schema. The API enforces it, but application code
-- is not a guarantee — a seed script, a manual INSERT or a future endpoint
-- could all bypass it, leaving an orphan row that belongs to nothing and is
-- reachable from no page.
--
-- Invariant enforced:
--   exactly ONE of leadId / meetingId / briefId / feedbackId / proposalId
--   is NOT NULL on every row.
--
-- Idempotent: safe to re-run. Applied via `npm run db:sync-triggers`.
-- ============================================================

ALTER TABLE "SalesAttachment"
  DROP CONSTRAINT IF EXISTS sales_attachment_one_parent;

ALTER TABLE "SalesAttachment"
  ADD CONSTRAINT sales_attachment_one_parent CHECK (
    (CASE WHEN "leadId"     IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "meetingId"  IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "briefId"    IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "feedbackId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "proposalId" IS NULL THEN 0 ELSE 1 END)
    = 1
  );

-- ── A converted lead cannot be re-pointed at a different client ─────────────
--
-- convertedClientId is @unique, which stops two leads claiming one client, but
-- it does not stop one lead being moved from client A to client B. The convert
-- API refuses when the field is already set, and no other route writes it — but
-- application code is not a guarantee, and a re-point would silently orphan the
-- original client from its sales history.
--
-- Invariant: once convertedClientId is non-null it is immutable; only clearing
-- it (an explicit un-conversion) is allowed.
CREATE OR REPLACE FUNCTION lead_conversion_is_final()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."convertedClientId" IS NOT NULL
     AND NEW."convertedClientId" IS NOT NULL
     AND NEW."convertedClientId" IS DISTINCT FROM OLD."convertedClientId" THEN
    RAISE EXCEPTION
      'Lead % is already converted to client %; it cannot be repointed to %',
      OLD.id, OLD."convertedClientId", NEW."convertedClientId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_conversion_is_final ON "Lead";
CREATE TRIGGER trg_lead_conversion_is_final
  BEFORE UPDATE OF "convertedClientId" ON "Lead"
  FOR EACH ROW
  EXECUTE FUNCTION lead_conversion_is_final();

-- ── Lead.probability and feedback scores are percentages ────────────────────
-- Guards the forecast maths: a probability outside 0–100 would silently corrupt
-- the weighted pipeline value, which is summed across every open lead.
ALTER TABLE "Lead"
  DROP CONSTRAINT IF EXISTS lead_probability_range;

ALTER TABLE "Lead"
  ADD CONSTRAINT lead_probability_range CHECK ("probability" BETWEEN 0 AND 100);

ALTER TABLE "SalesFeedback"
  DROP CONSTRAINT IF EXISTS sales_feedback_score_range;

ALTER TABLE "SalesFeedback"
  ADD CONSTRAINT sales_feedback_score_range CHECK (
    "opportunityScore" BETWEEN 0 AND 100
    AND ("closingProbability" IS NULL OR "closingProbability" BETWEEN 0 AND 100)
    AND ("opportunityStrength" IS NULL OR "opportunityStrength" BETWEEN 1 AND 10)
  );
