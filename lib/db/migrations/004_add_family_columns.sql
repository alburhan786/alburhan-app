-- Add family grouping columns to pilgrims table
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_id TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_relation TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_head BOOLEAN DEFAULT false;
