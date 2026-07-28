-- ============================================================
-- Client → Project → Task integrity
--
-- Task."clientId" is a denormalized copy of Project."clientId", kept so task
-- lists, Kanban filters and per-client reports can hit an indexed column
-- instead of joining through Project on every read.
--
-- The application derives it on write, but application code is not a guarantee:
-- a seed script, a manual UPDATE, a background job or a future endpoint could
-- all bypass it. These triggers make the invariant a property of the DATABASE,
-- so a task's client can never disagree with its project's client.
--
-- Invariant enforced:
--   task.projectId IS NOT NULL  =>  task.clientId = project.clientId
--   task.projectId IS NULL      =>  task.clientId is whatever was set (ad-hoc
--                                   work may carry its own client)
--
-- Idempotent: safe to re-run. Applied via `npm run db:sync-triggers`.
-- ============================================================

-- ── 1. On INSERT/UPDATE of a task: force clientId from the project ──────────
CREATE OR REPLACE FUNCTION task_sync_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."projectId" IS NOT NULL THEN
    -- Overwrite unconditionally rather than only when NULL: a caller passing a
    -- conflicting clientId is exactly the mismatch this exists to prevent.
    SELECT p."clientId" INTO NEW."clientId"
    FROM "Project" p
    WHERE p.id = NEW."projectId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_sync_client ON "Task";
CREATE TRIGGER trg_task_sync_client
  BEFORE INSERT OR UPDATE OF "projectId", "clientId" ON "Task"
  FOR EACH ROW
  EXECUTE FUNCTION task_sync_client();

-- ── 2. On UPDATE of a project's client: cascade to all of its tasks ─────────
-- Reparenting a project moves its whole body of work to the new client, so the
-- hierarchy stays true by definition.
CREATE OR REPLACE FUNCTION project_cascade_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."clientId" IS DISTINCT FROM OLD."clientId" THEN
    UPDATE "Task"
    SET "clientId" = NEW."clientId"
    WHERE "projectId" = NEW.id
      AND "clientId" IS DISTINCT FROM NEW."clientId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_cascade_client ON "Project";
CREATE TRIGGER trg_project_cascade_client
  AFTER UPDATE OF "clientId" ON "Project"
  FOR EACH ROW
  EXECUTE FUNCTION project_cascade_client();
