-- Seed script: Insert 6 individual Hajj 2027 packages
-- These replace the old generic "Hajj 2027 Packages" entry

DELETE FROM packages WHERE name = 'Hajj 2027 Packages' AND type = 'hajj';

INSERT INTO packages (id, name, type, description, duration, price_per_person, gst_percent, includes, highlights, departure_dates, featured, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Burhan Royal Elite – Hajj 2027', 'hajj', 'Al Burhan''s most premium Hajj 2027 package with elite accommodations and exclusive services for a spiritually enriching journey.', '40 Days', 0, 5, 
   '["Return Airfare", "Visa Processing", "Premium 5-Star Hotel in Makkah (Near Haram)", "Premium 5-Star Hotel in Madinah (Near Masjid Nabawi)", "VIP Moulim Services", "AC Luxury Transport Throughout", "All Ziyarat: Makkah, Madinah, Taif & Badar", "Premium Complimentary Hajj Kit", "Dedicated Group Leader", "All Meals Included"]'::jsonb,
   '["Elite 5-Star Accommodations", "Departure 11 May 2027", "VIP Moulim Category", "Premium Complimentary Kit", "Luxury AC Transport", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, true, true, now(), now()),

  (gen_random_uuid(), 'Burhan Elite Plus – Hajj 2027', 'hajj', 'Premium Hajj 2027 package with superior hotel selections, comprehensive services and a comfortable spiritual journey.', '40 Days', 0, 5,
   '["Return Airfare", "Visa Processing", "4-Star Hotel in Makkah (Close to Haram)", "4-Star Hotel in Madinah (Close to Masjid Nabawi)", "Moulim Services", "AC Transport Throughout", "Ziyarat: Makkah, Madinah, Taif & Badar", "Complimentary Hajj Kit", "Meals Included"]'::jsonb,
   '["4-Star Hotel Accommodations", "Departure 11 May 2027", "Comprehensive Moulim Services", "Complimentary Kit Included", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, false, true, now(), now()),

  (gen_random_uuid(), 'Burhan Comfort Plus – Hajj 2027', 'hajj', 'Comfortable Hajj 2027 package with 3-star accommodations and all essential services for a fulfilling pilgrimage.', '40 Days', 0, 5,
   '["Return Airfare", "Visa Processing", "3-Star Hotel in Makkah", "3-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat: Makkah, Madinah & Badar", "Complimentary Hajj Kit"]'::jsonb,
   '["3-Star Hotel Accommodations", "Departure 11 May 2027", "All Essential Services Included", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, false, true, now(), now()),

  (gen_random_uuid(), 'Burhan Comfort – Hajj 2027', 'hajj', 'A well-rounded Hajj 2027 package ensuring comfort and convenience throughout your sacred journey.', '40 Days', 0, 5,
   '["Return Airfare", "Visa Processing", "3-Star Hotel in Makkah", "3-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Hajj Kit"]'::jsonb,
   '["Comfortable 3-Star Accommodations", "Departure 11 May 2027", "Value for Money", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, false, true, now(), now()),

  (gen_random_uuid(), 'Burhan Economy Plus – Hajj 2027', 'hajj', 'A budget-friendly Hajj 2027 package without compromising on the essential services needed for your pilgrimage.', '40 Days', 0, 5,
   '["Return Airfare", "Visa Processing", "2-Star Hotel in Makkah", "2-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Basic Hajj Kit"]'::jsonb,
   '["Budget-Friendly Package", "Departure 11 May 2027", "All Essentials Included", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, false, true, now(), now()),

  (gen_random_uuid(), 'Burhan Budget Saver – Hajj 2027', 'hajj', 'Al Burhan''s most economical Hajj 2027 package — affordable price with all necessary services for your sacred journey.', '40 Days', 0, 5,
   '["Return Airfare", "Visa Processing", "Economy Hotel in Makkah", "Economy Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Basic Hajj Kit"]'::jsonb,
   '["Most Affordable Hajj Package", "Departure 11 May 2027", "Complete Hajj Journey", "GST Extra @ 5%"]'::jsonb,
   '["11 May 2027"]'::jsonb, false, true, now(), now())
ON CONFLICT DO NOTHING;

-- Promote user 9893989786 to admin
UPDATE users SET role = 'admin' WHERE mobile = '9893989786';
