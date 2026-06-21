-- ============================================================
-- GroundedDesk — Row-Level Security (RLS) Policies
-- Run this AFTER the initial Prisma migration
-- ============================================================

-- ── Helper function ─────────────────────────────────────────
-- Returns the current tenant ID from the session variable.
-- Returns NULL if not set (fail-closed behavior).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Enable RLS on all tenant-scoped tables ──────────────────

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_logs" ENABLE ROW LEVEL SECURITY;

-- ── Create isolation policies ───────────────────────────────
-- Each policy restricts SELECT, INSERT, UPDATE, DELETE to rows
-- where tenant_id matches the session variable.

-- Users
CREATE POLICY tenant_isolation ON "users"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- Knowledge Sources
CREATE POLICY tenant_isolation ON "knowledge_sources"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- Chunks
CREATE POLICY tenant_isolation ON "chunks"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- Conversations
CREATE POLICY tenant_isolation ON "conversations"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- Messages
CREATE POLICY tenant_isolation ON "messages"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- API Keys
CREATE POLICY tenant_isolation ON "api_keys"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- Cost Logs
CREATE POLICY tenant_isolation ON "cost_logs"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());

-- ── Force RLS even for table owners ─────────────────────────
-- By default, table owners bypass RLS. FORCE ensures that
-- even the owner must satisfy the policy.

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_sources" FORCE ROW LEVEL SECURITY;
ALTER TABLE "chunks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_logs" FORCE ROW LEVEL SECURITY;

-- ── Bypass policy for superadmin operations ─────────────────
-- Create a policy that allows operations when no tenant context
-- is needed (e.g., during migrations, seeding).
-- The application uses a separate "admin" connection for these.

CREATE POLICY admin_bypass ON "users"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "knowledge_sources"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "chunks"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "conversations"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "messages"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "api_keys"
  USING (current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY admin_bypass ON "cost_logs"
  USING (current_setting('app.bypass_rls', true) = 'true');
