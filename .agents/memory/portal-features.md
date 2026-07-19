---
name: Branch/Agent Portal Features
description: Schema quirks and feature summary for Branch Manager and Agent portals
---

## Key schema facts
- bookings.customer_id (NOT user_id) — INSERT must use customer_id
- agents table: branch_id is UUID FK to branches; is_active bool; commission_rate numeric
- documents.uploaded_by enum: 'customer' | 'admin' — use 'admin' for agent uploads
- booking_status enum: pending | approved | rejected | confirmed | cancelled | partially_paid
- document_type has 21 values including passport, aadhaar, visa, other

## Portal route ownership
- All portal routes live in src/routes/portal.ts (single file)
- Branch guard: req.user.role === 'branch_manager'
- Agent guard: req.user.role === 'agent'
- Branch lookup: branches.manager_mobile = req.user.mobile
- Agent lookup: agents.mobile = req.user.mobile (joined with branches)

## Frontend tab structure
- BranchPortal.tsx: tabs Overview | My Agents (Tab type: "overview" | "agents")
- AgentPortal.tsx: tabs Overview | New Booking | Commissions | Documents

## Booking creation (agent portal)
- booking_number pattern: ABT-${Date.now().toString(36).toUpperCase()}
- Creates user account if mobile not found (role=customer)
- Sets is_offline=true, status='pending', agent_id, branch_id

**Why:** bookings.user_id does not exist — this was a bug that caused 500 on first deploy.
**How to apply:** Any raw INSERT into bookings must use customer_id, not user_id.
