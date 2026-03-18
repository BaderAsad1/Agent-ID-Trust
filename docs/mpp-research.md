# Stripe Machine Payments Protocol (MPP) — Research Summary

## Overview

Stripe's Machine Payments Protocol (MPP) is an emerging standard for autonomous agent commerce. It enables machine-to-machine payments using Stripe's existing fiat payment infrastructure, allowing AI agents to transact without human intervention.

## What MPP Officially Supports

### Core Concepts
- **PaymentIntents for Machine Payments**: Standard Stripe PaymentIntents with machine-specific metadata, enabling automated creation, confirmation, and capture flows.
- **Idempotency Keys**: Built-in replay protection via Stripe's native idempotency key support on all write operations.
- **Payment Method Types**: Card-based payments via pre-authorized payment methods attached to Stripe Customers, enabling off-session (no human present) charges.
- **402 Payment Required Flow**: HTTP-native payment negotiation — server returns 402 with payment requirements, client creates/confirms payment, then retries with proof.

### Payment Flow
1. Client requests a protected resource
2. Server returns HTTP 402 with payment requirements (amount, currency, accepted methods)
3. Client creates a Stripe PaymentIntent using pre-authorized credentials
4. Client confirms payment and obtains a PaymentIntent ID
5. Client retries the original request with the PaymentIntent ID as proof
6. Server verifies the PaymentIntent status via Stripe API
7. Server captures the payment and releases the resource

### What's Stable
- Stripe PaymentIntents API (fully GA)
- Off-session payments with saved payment methods
- Idempotency keys on all Stripe API calls
- Manual capture mode (authorize then capture)
- Webhook-based payment verification

### What's Early-Access / Emerging
- The "MPP" protocol specification itself (naming, header formats, negotiation flow)
- Shared Payment Tokens (SPTs) — a mechanism for delegated payment authority
- Standard header formats for 402 responses across implementations
- Cross-platform agent payment interoperability

## Comparison with x402

| Feature | x402/USDC | Stripe MPP |
|---------|-----------|------------|
| Currency | USDC (stablecoin) | Fiat (USD, EUR, etc.) |
| Settlement | On-chain (Base L2) | Stripe (traditional rails) |
| Verification | Facilitator + on-chain | Stripe API |
| Latency | ~2-5 seconds (block confirmation) | ~1-2 seconds |
| Cost | Gas fees + USDC transfer | Stripe fees (2.9% + $0.30) |
| KYC | Wallet-based (pseudonymous) | Stripe Customer (KYC'd) |
| Reversibility | Irreversible on-chain | Refundable via Stripe |
| Offline capability | Requires blockchain access | Requires Stripe API access |
| Agent onboarding | Needs wallet + USDC funding | Needs Stripe Customer + payment method |

### Key Differences
- **x402** is crypto-native: agents pay with USDC on Base, verification is on-chain via a facilitator service
- **MPP** is fiat-native: agents pay with pre-authorized cards via Stripe, verification is via Stripe API
- Both use the HTTP 402 status code pattern but with different header formats and verification flows
- They are **complementary** — different payment rails for different use cases

## Assumptions Made
1. MPP PaymentIntents use standard Stripe PaymentIntents API with `capture_method: "manual"` for authorize-then-capture flow
2. Machine agents authenticate payments using saved payment methods on a Stripe Customer object (off-session)
3. The 402 response format follows a JSON structure similar to x402 but with Stripe-specific fields
4. Idempotency is enforced both at the Stripe level (idempotency keys) and at the application level (database dedup)
5. SPTs are modeled as pre-authorized payment method references stored on the agent record
6. Trust tier influences payment terms (e.g., trusted agents may get post-pay or higher limits)

## Sources
- Stripe PaymentIntents API documentation
- Stripe off-session payments guide
- x402 protocol specification (x402.org)
- Agent commerce blog posts and protocol discussions
- Stripe idempotency keys documentation
