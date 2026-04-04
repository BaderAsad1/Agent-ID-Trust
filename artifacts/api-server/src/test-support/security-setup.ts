export const E2E_STRIPE_WEBHOOK_SECRET =
  "whsec_e2e_test_secret_for_integration_123456789";

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  process.env.STRIPE_WEBHOOK_SECRET = E2E_STRIPE_WEBHOOK_SECRET;
}
