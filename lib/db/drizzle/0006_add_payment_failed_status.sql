ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'payment_failed' AFTER 'payment_pending';
