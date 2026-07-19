---
name: Portal login roles
description: Branch managers, agents, and staff login via OTP; get dedicated portals not admin access
---

# Portal Login Roles

user_role enum now has 5 values: customer, admin, branch_manager, agent, staff

## How role is assigned at first login (send-otp)
- Check branches.manager_mobile → role=branch_manager
- Check agents.mobile → role=agent
- Check staff.mobile_india → role=staff
- Else: customer (or admin if in ADMIN_MOBILES hardcoded list)

## Session / entityId
- verify-otp sets session.entityId = branch/agent/staff UUID
- response includes entityId for frontend awareness

## Portal API endpoints
- GET /api/portal/branch — branch_manager role only, lookup by mobile
- GET /api/portal/agent — agent role only, lookup by mobile
- GET /api/portal/staff — staff role only, lookup by mobile
- All use payment_transactions (NOT payments) for revenue queries
- All use b.deleted_at IS NULL filter on bookings

## Frontend routing
- branch_manager → /branch/dashboard (BranchRoute guard)
- agent → /agent/dashboard (AgentRoute guard)
- staff → /staff/dashboard (StaffRoute guard)
- CustomerRoute + AdminRoute also redirect portal users away

**Why:** These user types live in separate tables (branches/agents/staff) with no users rows.
Cross-table role detection at send-otp time is the cleanest solution without schema migrations.
