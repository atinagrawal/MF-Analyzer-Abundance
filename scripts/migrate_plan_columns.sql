-- Run once against your Postgres DB to add plan columns to the users table.
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan              TEXT        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
