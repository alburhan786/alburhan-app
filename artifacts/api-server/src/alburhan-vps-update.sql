-- VPS DB update: Hajj 2026 groups + packages
-- Run once on VPS: psql -U alburhan -d alburhandb -f alburhan-vps-update.sql

-- Hajj 2026 Groups
INSERT INTO hajj_groups (id, group_name, year, starting_serial_number, created_at, updated_at)
VALUES
  ('7bbcb7cb-ad48-4e87-b93c-3ccfd92383e2', 'alburhan jan', 2026, 1, NOW(), NOW()),
  ('465defcd-dc5a-4963-9168-7ecae7a34572', 'Hajj Group 2 - 2026', 2026, 1, NOW(), NOW()),
  ('4631f12d-9959-42c7-9ef6-2a75a5b606cc', 'Hajj Group 3 - 2026', 2026, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Hajj 2026 Packages
INSERT INTO packages (id, name, type, description, duration, price_per_person, gst_percent, includes, highlights, departure_dates, featured, is_active, created_at, updated_at)
VALUES
  ('eee88dd9-5068-4125-8b54-b2dbd021dc72', 'Burhan Royal Elite – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — 5-Star accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","5-Star Hotel in Makkah","5-Star Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["5-Star Accommodations","Hajj 2026","VIP Moulim Category","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW()),

  ('5b93c2d4-53ef-41f6-9b9e-e35459202eaa', 'Burhan Elite Plus – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — 4-Star accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","4-Star Hotel in Makkah","4-Star Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["4-Star Accommodations","Hajj 2026","Premium Moulim Services","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW()),

  ('6a143289-245c-48b1-b0d3-a001544f9d4d', 'Burhan Comfort Plus – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — 3-Star accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","3-Star Hotel in Makkah","3-Star Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["3-Star Accommodations","Hajj 2026","All Essential Services","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW()),

  ('58965a3e-491d-4c8e-924a-2efe22b9793d', 'Burhan Comfort – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — 3-Star accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","3-Star Hotel in Makkah","3-Star Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["3-Star Accommodations","Hajj 2026","Value for Money","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW()),

  ('7e2d210d-de34-4582-bc47-05d93115a1c3', 'Burhan Economy Plus – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — 2-Star accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","2-Star Hotel in Makkah","2-Star Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["2-Star Accommodations","Hajj 2026","Budget-Friendly","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW()),

  ('a7088ad8-5cc5-4266-9c1c-ddc155f31471', 'Burhan Budget Saver – Hajj 2026', 'hajj',
   'Al Burhan Hajj 2026 package — Economy accommodations with comprehensive services.',
   '40 Days', 0, 5,
   '["Return Airfare","Visa Processing","Economy Hotel in Makkah","Economy Hotel in Madinah","Moulim Services","AC Transport Throughout","Ziyarat Included","Hajj Kit"]'::jsonb,
   '["Economy Accommodations","Hajj 2026","Most Affordable","GST Extra @ 5%"]'::jsonb,
   '["2026"]'::jsonb, false, true, NOW(), NOW())

ON CONFLICT (id) DO NOTHING;
