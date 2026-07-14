---
name: Agreements schema column types
description: Column type requirements and schema bugs found in agreements table and related tables
---

## Rule
- `agreements.booking_id` MUST be TEXT (not UUID) — bookings.id is TEXT
- `agreements.customer_id` MUST be TEXT (not UUID) — users.id is TEXT
- `hajj_groups` has `group_name` NOT `name` — every SQL query must use `hg.group_name`
- `notification_logs` error column is `error_code` NOT `error_message`
- `agreement_audit_logs.agreement_id` MUST be TEXT (not UUID)

**Why:** bookings.id and users.id are TEXT (not UUID) in this schema despite looking like UUIDs. Any FK column referencing them must be TEXT or PostgreSQL throws "operator does not exist: text = uuid" on JOINs.

**How to apply:** When writing any new table with FKs to bookings/users, always use TEXT. The migration in index.ts includes idempotent `ALTER COLUMN ... TYPE TEXT USING ...::text` to fix existing tables.

## hajj_groups columns (confirmed)
id, group_name, year, departure_date, return_date, flight_number, maktab_number, hotels, notes, created_at, updated_at, company_id, starting_serial_number

## notification_logs columns (confirmed)
id, notification_id, event_type, customer_id, booking_id, channel, template, recipient, message, status, provider_response, sent_at, delivered_at, retry_count, created_at, provider_name, api_endpoint, http_status, request_payload, **error_code**, updated_at, customer_name, booking_number
