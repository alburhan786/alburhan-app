-- =============================================================================
-- SaaS Phase 4 Strict — Two-Tenant UAT Dataset (v41.12)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- Creates two isolated test tenants and synthetic test data for cross-tenant
-- security validation (UAT). All data is clearly marked [UAT TEST].
--
-- Tenant A: Al Burhan UAT Test   aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
-- Tenant B: Demo Travel Agency   bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb
--
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- To clean up:
--   DELETE FROM tenants WHERE id IN (
--     'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
--     'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
--   );
--   (bookings, leads, users, etc. will cascade if FK enforced, else delete manually)
-- =============================================================================

BEGIN;

-- ── v41.12.A: Create UAT Tenants ──────────────────────────────────────────────
INSERT INTO tenants (id, slug, name, plan, status, settings)
VALUES
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'alburhan-uat',
   '[UAT TEST] Al Burhan UAT Test', 'enterprise', 'active',
   '{"uat": true, "description": "UAT test tenant — safe to delete"}'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'demo-travel',
   '[UAT TEST] Demo Travel Agency', 'starter', 'active',
   '{"uat": true, "description": "UAT test tenant — safe to delete"}')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.B: Users (customer role) ──────────────────────────────────────────
INSERT INTO users (id, name, email, mobile, role, tenant_id, status, is_verified)
VALUES
  -- Tenant A users
  ('uat-user-a-001', '[UAT] Ahmed Al Burhan', 'uat-ahmed@alburhan-test.invalid',
   '9991000001', 'customer', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'active', true),
  ('uat-user-a-002', '[UAT] Fatima Al Burhan', 'uat-fatima@alburhan-test.invalid',
   '9991000002', 'customer', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'active', true),
  -- Tenant B users
  ('uat-user-b-001', '[UAT] Raza Demo Travel', 'uat-raza@demo-travel.invalid',
   '9992000001', 'customer', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'active', true),
  ('uat-user-b-002', '[UAT] Sara Demo Travel', 'uat-sara@demo-travel.invalid',
   '9992000002', 'customer', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.C: Packages ────────────────────────────────────────────────────────
-- Uses snake_case column names matching the actual packages table schema
INSERT INTO packages (id, name, description, type, price_per_person, gst_percent,
  is_active, departure_dates, tenant_id)
VALUES
  -- Tenant A packages
  ('aaaaaaaa-aaaa-4aaa-8888-000000000001',
   '[UAT-A] Hajj Package Gold 2027', 'UAT test package for Tenant A',
   'hajj', 250000, 5, true,
   '["2027-05-01"]'::jsonb,
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  ('aaaaaaaa-aaaa-4aaa-8888-000000000002',
   '[UAT-A] Umrah Economy 2027', 'UAT test package for Tenant A',
   'umrah', 85000, 5, true,
   '["2027-02-01"]'::jsonb,
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  -- Tenant B packages
  ('bbbbbbbb-bbbb-4bbb-8888-000000000001',
   '[UAT-B] Hajj Standard 2027', 'UAT test package for Tenant B',
   'hajj', 200000, 5, true,
   '["2027-05-01"]'::jsonb,
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  ('bbbbbbbb-bbbb-4bbb-8888-000000000002',
   '[UAT-B] Umrah Budget 2027', 'UAT test package for Tenant B',
   'umrah', 70000, 5, true,
   '["2027-03-01"]'::jsonb,
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.D: Leads ───────────────────────────────────────────────────────────
INSERT INTO leads (id, name, mobile, email, source, status, tenant_id)
VALUES
  -- Tenant A leads
  ('aaaaaaaa-aaaa-4aaa-9999-000000000001',
   '[UAT-A] Lead One', '9991100001', 'uat-lead1@alburhan-test.invalid',
   'website', 'new', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  ('aaaaaaaa-aaaa-4aaa-9999-000000000002',
   '[UAT-A] Lead Two', '9991100002', 'uat-lead2@alburhan-test.invalid',
   'whatsapp', 'contacted', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  -- Tenant B leads
  ('bbbbbbbb-bbbb-4bbb-9999-000000000001',
   '[UAT-B] Lead One', '9992100001', 'uat-lead1@demo-travel.invalid',
   'website', 'new', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  ('bbbbbbbb-bbbb-4bbb-9999-000000000002',
   '[UAT-B] Lead Two', '9992100002', 'uat-lead2@demo-travel.invalid',
   'facebook', 'qualified', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.E: Bookings ────────────────────────────────────────────────────────
-- Uses snake_case column names matching the actual bookings table schema
INSERT INTO bookings (id, booking_number, package_id, package_name,
  customer_id, customer_name, customer_mobile, customer_email,
  number_of_pilgrims, status, final_amount, tenant_id)
VALUES
  -- Tenant A bookings
  ('aaaaaaaa-aaaa-4aaa-7777-000000000001',
   'UAT-A-001',
   'aaaaaaaa-aaaa-4aaa-8888-000000000001',
   '[UAT-A] Hajj Package Gold 2027',
   'uat-user-a-001', '[UAT] Ahmed Al Burhan', '9991000001', 'uat-ahmed@alburhan-test.invalid',
   2, 'confirmed', 525000,
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  ('aaaaaaaa-aaaa-4aaa-7777-000000000002',
   'UAT-A-002',
   'aaaaaaaa-aaaa-4aaa-8888-000000000002',
   '[UAT-A] Umrah Economy 2027',
   'uat-user-a-002', '[UAT] Fatima Al Burhan', '9991000002', 'uat-fatima@alburhan-test.invalid',
   1, 'pending', 89250,
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  -- Tenant B bookings
  ('bbbbbbbb-bbbb-4bbb-7777-000000000001',
   'UAT-B-001',
   'bbbbbbbb-bbbb-4bbb-8888-000000000001',
   '[UAT-B] Hajj Standard 2027',
   'uat-user-b-001', '[UAT] Raza Demo Travel', '9992000001', 'uat-raza@demo-travel.invalid',
   3, 'confirmed', 630000,
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  ('bbbbbbbb-bbbb-4bbb-7777-000000000002',
   'UAT-B-002',
   'bbbbbbbb-bbbb-4bbb-8888-000000000002',
   '[UAT-B] Umrah Budget 2027',
   'uat-user-b-002', '[UAT] Sara Demo Travel', '9992000002', 'uat-sara@demo-travel.invalid',
   1, 'pending', 73500,
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.F: Payment transactions ───────────────────────────────────────────
-- Schema: id, booking_id, amount, payment_date (TEXT NOT NULL), payment_mode (enum), reference_number, tenant_id
INSERT INTO payment_transactions (id, booking_id, amount, payment_date,
  payment_mode, reference_number, tenant_id)
VALUES
  -- Tenant A payments
  ('aaaaaaaa-aaaa-4aaa-6666-000000000001',
   'aaaaaaaa-aaaa-4aaa-7777-000000000001',
   200000, '2027-01-15', 'online', 'UAT-PAY-A-001',
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  -- Tenant B payments
  ('bbbbbbbb-bbbb-4bbb-6666-000000000001',
   'bbbbbbbb-bbbb-4bbb-7777-000000000001',
   250000, '2027-01-16', 'online', 'UAT-PAY-B-001',
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.G: Invoices ────────────────────────────────────────────────────────
-- invoice_number is NOT NULL — must supply. Uses actual column names.
INSERT INTO invoices (id, invoice_number, booking_id, customer_id, customer_name,
  total, paid, invoice_status, payment_status, tenant_id)
VALUES
  -- Tenant A invoices
  ('aaaaaaaa-aaaa-4aaa-5555-000000000001',
   'UAT-INV-A-001',
   'aaaaaaaa-aaaa-4aaa-7777-000000000001',
   'uat-user-a-001', '[UAT] Ahmed Al Burhan',
   525000, 200000, 'partially_paid', 'partial',
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  -- Tenant B invoices
  ('bbbbbbbb-bbbb-4bbb-5555-000000000001',
   'UAT-INV-B-001',
   'bbbbbbbb-bbbb-4bbb-7777-000000000001',
   'uat-user-b-001', '[UAT] Raza Demo Travel',
   630000, 250000, 'partially_paid', 'partial',
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.H: Support tickets ─────────────────────────────────────────────────
-- ticket_number is NOT NULL — must supply
INSERT INTO support_tickets (id, ticket_number, customer_id, booking_id, subject,
  category, status, priority, tenant_id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-4444-000000000001',
   'UAT-TKT-A-001',
   'uat-user-a-001',
   'aaaaaaaa-aaaa-4aaa-7777-000000000001',
   '[UAT-A] Passport submission query',
   'general', 'open', 'normal',
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-4444-000000000001',
   'UAT-TKT-B-001',
   'uat-user-b-001',
   'bbbbbbbb-bbbb-4bbb-7777-000000000001',
   '[UAT-B] Visa status query',
   'general', 'open', 'high',
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.I: Notification logs ───────────────────────────────────────────────
-- Uses recipient (not customer_mobile) for the notification recipient field
INSERT INTO notification_logs (id, booking_id, recipient, event_type, channel,
  status, tenant_id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-3333-000000000001',
   'aaaaaaaa-aaaa-4aaa-7777-000000000001',
   '9991000001', 'booking_confirmed', 'whatsapp', 'delivered',
   'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-3333-000000000001',
   'bbbbbbbb-bbbb-4bbb-7777-000000000001',
   '9992000001', 'booking_confirmed', 'whatsapp', 'delivered',
   'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- ── v41.12.J: AI conversations (wrapped in DO/EXCEPTION — optional data) ────────
-- ai_conversations may have required columns (e.g. conversation_key, channel) with
-- no default. Wrap in DO/EXCEPTION so failures do not abort the main transaction.
DO $$
BEGIN
  INSERT INTO ai_conversations (id, conversation_key, channel, customer_id, customer_name, tenant_id)
  VALUES
    ('aaaaaaaa-aaaa-4aaa-2222-000000000001',
     'uat-conv-a-001', 'whatsapp',
     'uat-user-a-001', '[UAT] Ahmed Al Burhan',
     'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-4bbb-2222-000000000001',
     'uat-conv-b-001', 'whatsapp',
     'uat-user-b-001', '[UAT] Raza Demo Travel',
     'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ai_conversations insert skipped (optional): %', SQLERRM;
END $$;

-- ── v41.12.K: AI Knowledge Base (wrapped in DO/EXCEPTION — optional data) ──────
DO $$
BEGIN
  INSERT INTO ai_knowledge_base (id, title, content, category, tenant_id)
  VALUES
    ('aaaaaaaa-aaaa-4aaa-1111-000000000001',
     '[UAT-A] Hajj FAQ', 'UAT test knowledge base article for Tenant A',
     'faq', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-4bbb-1111-000000000001',
     '[UAT-B] Travel Insurance FAQ', 'UAT test knowledge base article for Tenant B',
     'faq', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ai_knowledge_base insert skipped (optional): %', SQLERRM;
END $$;

-- ── v41.12.L: Tenant credentials (test placeholder keys — NOT real) ───────────
INSERT INTO tenant_credentials (tenant_id, key_name, encrypted_value, iv, auth_tag, key_version)
VALUES
  -- Tenant A placeholder credential
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
   'BOTBEE_API_KEY', 'dWF0LXRlc3QtY2lwaGVydGV4dA==', 'dWF0aXYxMg==', 'dWF0YXV0aHRhZzE2Ynl0', 1),
  -- Tenant B placeholder credential
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
   'BOTBEE_API_KEY', 'dWF0LXRlc3QtY2lwaGVydGV4dA==', 'dWF0aXYxMg==', 'dWF0YXV0aHRhZzE2Ynl0', 1)
ON CONFLICT (tenant_id, key_name) DO NOTHING;

-- ── v41.12.M: Tenant quotas ───────────────────────────────────────────────────
-- Tenant B gets starter-plan limits; Tenant A gets NULL (unlimited, enterprise)
INSERT INTO tenant_quotas (tenant_id, resource, max_count, window_type, notes)
VALUES
  -- Tenant B starter plan limits (test quota enforcement)
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'bookings',           100, 'total',   'UAT-B starter plan'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'users',               10, 'total',   'UAT-B starter plan'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'leads',              500, 'total',   'UAT-B starter plan'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'packages',            10, 'total',   'UAT-B starter plan'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'whatsapp_monthly',  1000, 'monthly', 'UAT-B starter plan'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'sms_monthly',        500, 'monthly', 'UAT-B starter plan'),
  -- Tenant A unlimited (enterprise) — NULL = unlimited
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bookings', NULL, 'total',   'UAT-A enterprise unlimited'),
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'users',    NULL, 'total',   'UAT-A enterprise unlimited'),
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'leads',    NULL, 'total',   'UAT-A enterprise unlimited')
ON CONFLICT (tenant_id, resource, window_type) DO NOTHING;

-- ── v41.12.N: Summary (in DO block so RAISE NOTICE works) ────────────────────
DO $$
DECLARE
  cnt_a INT;
  cnt_b INT;
  cnt_leads_a INT;
  cnt_leads_b INT;
BEGIN
  SELECT COUNT(*) INTO cnt_a FROM bookings
   WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  SELECT COUNT(*) INTO cnt_b FROM bookings
   WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  SELECT COUNT(*) INTO cnt_leads_a FROM leads
   WHERE tenant_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  SELECT COUNT(*) INTO cnt_leads_b FROM leads
   WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  RAISE NOTICE 'v41.12 SUMMARY: Tenant A bookings=%, leads=% | Tenant B bookings=%, leads=%',
    cnt_a, cnt_leads_a, cnt_b, cnt_leads_b;
  RAISE NOTICE 'v41.12 COMPLETE: Two-tenant UAT dataset ready ✓';
END $$;

COMMIT;
