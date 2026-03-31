-- Migration 001: Clear wrong uploaded image from iraq_ziyarat packages
-- A wrong wedding/henna photo was uploaded as cover for Iraq Ziyarat packages.
-- This one-time fix sets image_url to NULL so the correct fallback image is shown.
-- Run: psql $DATABASE_URL -f lib/db/migrations/001_clear_wrong_iraq_image.sql

UPDATE packages SET image_url = NULL WHERE type = 'iraq_ziyarat';
