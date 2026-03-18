# Stripe MPP Developer Guide

## Overview

Agent ID supports two payment protocols for machine-to-machine transactions:
- **x402/USDC**: Crypto payments via USDC on Base L2
- **Stripe MPP**: Fiat payments via Stripe Machine Payments Protocol

This guide covers how to integrate with MPP for all three personas: accepting payments, making payments, and trust-aware payments.

## 1. Accepting MPP Payments (Server-Side)

### Protecting an Endpoint

Use the `mppPaymentRequired` middleware to protect any Express endpoint:

```typescript
import { mppPaymentRequired } from "../middlewares/mpp";

router.get(
  "/premium-data/:id",
  mppPaymentRequired(
    100,                    // amount in cents ($1.00)
    "Premium data access",  // description
    "premium_data",         // payment type
  ),
  async (req, res) => {
    // This code only runs after payment is verified
    const payment = (req as any).mppPayment;
    res.json({ data: "premium content", paymentId: payment.id });
  },
);
```

### Payment Flow

1. Client calls the protected endpoint without payment
2. Server returns HTTP 402 with MPP payment requirements:
   ```json
   {
     "error": "PAYMENT_REQUIRED",
     "protocol": "stripe_mpp",
     "requirement": {
       "mppVersion": 1,
       "provider": "stripe",
       "amountCents": 100,
       "currency": "usd",
       "description": "Premium data access",
       "idempotencyKey": "abc123...",
       "acceptedMethods": ["card", "stripe_preauth"]
     }
   }
   ```
3. Client creates and confirms a Stripe PaymentIntent for the required amount
4. Client retries the request with `X-MPP-Payment: pi_xxx` header
5. Server verifies the PaymentIntent via Stripe API, captures it, and serves the resource

### Trust-Aware Pricing

The middleware automatically applies discounts based on the agent's trust tier:
- **Elite**: 50% discount
- **Trusted**: 25% discount
- **Verified**: 10% discount
- **Basic/Unverified**: No discount

The 402 response includes discount details when applicable:
```json
{
  "requirement": {
    "amountCents": 50,
    "trustDiscount": {
      "originalAmountCents": 100,
      "discountPercent": 50,
      "reason": "elite tier discount"
    }
  }
}
```

## 2. Making MPP Payments (Client-Side)

### Using the SDK

```typescript
import { AgentID, MppModule } from "@agentid/sdk";

const agent = await AgentID.init({ apiKey: "your-api-key" });

// Step 1: Make a request and detect 402
const response = await fetch("https://getagent.id/api/v1/mpp/premium-resolve/some-agent");

if (MppModule.isMppPaymentRequired(response)) {
  const body = await response.json();
  const requirement = MppModule.parseMppRequirement(body);

  if (requirement) {
    // Step 2: Create a payment intent
    const payment = await agent.mpp.createPaymentIntent({
      amountCents: requirement.amountCents,
      paymentType: requirement.paymentType,
      resourceId: requirement.resourceId,
    });

    // Step 3: Confirm payment with Stripe (using your payment method)
    // ... Stripe.js or server-side confirmation ...

    // Step 4: Retry with payment proof
    const result = await agent.mpp.payAndRetry(
      requirement.resource,
      requirement,
      payment.paymentIntentId!,
    );
  }
}
```

### Payment History

```typescript
const history = await agent.mpp.getPaymentHistory(20, 0);
console.log(`Total payments: ${history.total}`);
for (const payment of history.payments) {
  console.log(payment);
}
```

## 3. Trust + Payment Combined Flow

### How Trust Affects Payments

Agent ID integrates trust scoring with payment processing:

1. **Trust-Based Pricing**: Higher-trust agents pay less per call
2. **Payment History**: Successful payments contribute to trust score
3. **Credential Advertising**: Agent credentials advertise payment readiness

### Agent Credential Payment Methods

When an agent has MPP configured, their credential includes:
```json
{
  "credentialSubject": {
    "paymentMethods": ["stripe_mpp", "x402_usdc"],
    "trustScore": 85,
    "trustTier": "trusted"
  }
}
```

### DID Document Service Endpoints

The ERC-8004 DID document includes an MPP service endpoint:
```json
{
  "service": [
    {
      "id": "did:web:getagent.id:agents:my-agent#mpp",
      "type": "StripeMppPaymentEndpoint",
      "serviceEndpoint": "https://getagent.id/api/v1/mpp/premium-resolve/my-agent"
    }
  ]
}
```

## 4. MCP Tool Integration

### agentid_mpp_pay

Create an MPP payment intent via MCP:
```json
{
  "name": "agentid_mpp_pay",
  "arguments": {
    "amountCents": 100,
    "paymentType": "premium_resolve",
    "targetUrl": "https://getagent.id/api/v1/mpp/premium-resolve/some-agent"
  }
}
```

### agentid_mpp_providers

List available payment providers:
```json
{
  "name": "agentid_mpp_providers",
  "arguments": {}
}
```

## 5. API Reference

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/mpp/providers` | None | List payment providers |
| POST | `/api/v1/mpp/create-intent` | Agent | Create a payment intent |
| GET | `/api/v1/mpp/premium-resolve/:handle` | Agent + MPP | Premium resolve (paid) |
| GET | `/api/v1/mpp/payments/history` | Agent | Payment history |
| GET | `/api/v1/mpp/payments/:paymentId` | Agent | Single payment detail |

### Headers

| Header | Direction | Description |
|--------|-----------|-------------|
| `X-MPP-Payment` | Request | Stripe PaymentIntent ID for payment proof |
| `X-MPP-Requirements` | Response | JSON payment requirements (on 402) |

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `PAYMENT_REQUIRED` | 402 | Payment needed — see requirements |
| `INVALID_PAYMENT` | 400 | Invalid PaymentIntent ID format |
| `INSUFFICIENT_PAYMENT` | 402 | Amount too low |
| `PAYMENT_NOT_READY` | 402 | PaymentIntent not confirmed |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key reused with different PI |
| `PAYMENT_FAILED` | 402 | Previous payment attempt failed |

## 6. Security Model

- **No credential leakage**: Payment methods are verified server-side via Stripe API
- **Idempotency**: Every payment has a unique idempotency key preventing replay
- **Amount verification**: Server validates payment amount meets requirement
- **Audit trail**: All MPP transactions logged in `mpp_payments` table
- **Trust gating**: Agent trust tier verified before applying discounts
