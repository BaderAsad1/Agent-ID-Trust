# MPP Architecture Decision Memo

## Context
Agent ID has an existing payment infrastructure:
- **Stripe subscriptions** for plan billing
- **x402/USDC** middleware for per-call crypto payments
- **Agentic payment authorizations** for pre-authorized Stripe charges
- **PaymentProvider abstraction** for multi-provider support
- **CDP wallets** for on-chain operations

MPP adds Stripe-native fiat payment rails for machine-to-machine per-call transactions.

## Decision: MPP's Role in Agent ID

### "Paying Us" (Agents → Agent ID)
MPP enables agents to pay for premium API calls using Stripe-backed payment methods:
- Premium resolve lookups
- Paid verification endpoints
- Per-call API metering beyond plan limits

This complements x402 (crypto) and subscription billing (recurring).

### "Paying Others" (Agent ID agents → Third-party services)
MPP client helpers enable Agent ID-authenticated agents to pay external services:
- SDK methods for detecting 402 MPP responses
- Automatic payment flow handling
- Payment audit trail in the ledger

## Architecture

### Provider Layer
```
PaymentProvider (interface)
├── StripeProvider (existing — subscriptions, manual charges)
├── CoinbaseAgenticProvider (stub)
├── VisaAgenticProvider (stub)
└── StripeMppProvider (NEW — per-call machine payments)
```

StripeMppProvider implements the existing PaymentProvider interface:
- `createIntent`: Creates a Stripe PaymentIntent with `capture_method: "manual"`, machine payment metadata
- `authorizePayment`: Verifies PaymentIntent status via Stripe API
- `capturePayment`: Captures an authorized PaymentIntent
- `refundPayment`: Issues refund on a captured PaymentIntent

### Middleware Layer
```
Middleware Stack
├── x402PaymentRequired (existing — crypto payments)
└── mppPaymentRequired (NEW — Stripe fiat payments)
```

The MPP middleware:
1. Checks for `X-MPP-Payment` header (PaymentIntent ID)
2. If absent: returns 402 with MPP payment requirements
3. If present: verifies PaymentIntent via Stripe, checks idempotency, records in DB
4. Trust-aware: adjusts pricing/requirements based on agent trust tier

### Database
New `mpp_payments` table (mirrors x402_payments pattern):
- Tracks payment lifecycle (pending → verified → captured → completed)
- Idempotency key with unique index for replay protection
- Links to agent, stores Stripe PaymentIntent reference
- Audit fields (created_at, updated_at, error_message)

### SDK
New `MppModule` added to SDK:
- `detectMppRequirement(response)`: Parses 402 responses for MPP requirements
- `createMppPayment(requirement, paymentMethodId)`: Creates and confirms PaymentIntent
- `retryWithPayment(url, paymentIntentId, options)`: Retries request with payment proof
- Server-side: `protectWithMpp(options)`: Express middleware helper

### MCP Integration
New `agentid_mpp_pay` tool:
- Detects MPP payment requirements on a target URL
- Initiates payment flow
- Returns result after payment + resource access

## v1 Scope
- StripeMppProvider in PaymentProvider abstraction
- mppPaymentRequired middleware
- One real protected endpoint (premium resolve)
- MPP payment tracking in database
- SDK client helpers
- MCP tool for MPP payments
- Trust-aware pricing

## Deferred to Later
- Stripe Connect onboarding for third-party merchants accepting MPP
- Shared Payment Token (SPT) delegation chains
- Cross-platform MPP interoperability testing
- MPP webhook processing for async settlement
- Production-grade rate limiting on MPP endpoints

## Interface Boundaries
- MPP middleware is independent of x402 middleware (no shared state)
- Both coexist on endpoints via composition (an endpoint can accept both)
- PaymentProvider abstraction isolates Stripe API details
- SDK module is self-contained, no dependency on x402 SDK code
- Database tables are separate (mpp_payments vs x402_payments)

## Security Model
- PaymentIntent IDs are verified server-side via Stripe API (no client trust)
- Idempotency keys prevent replay attacks
- Amount verification ensures client pays the required amount
- Trust tier checked before payment processing
- All transactions logged to audit table
