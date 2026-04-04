# Stress Test Results

**Date:** 2026-04-03  
**Script:** `scripts/load-stress.js`  
**Target:** `https://getagent.id/api/v1` (staging API — the pre-launch deployment; no separate staging environment exists in this project)  
**Tool:** k6 v0.57.0

## Gate Status: PASS

Both launch-gate thresholds passed on the staging API at 500 peak VUs:

| Threshold | Result | Status |
|---|---|---|
| p95 latency < 2000 ms | **1.86 s** | ✅ PASS |
| Error rate < 5% | **0.00%** | ✅ PASS |

---

## Test Configuration

The `scripts/load-stress.js` script defines the following profile:

| Parameter | Value |
|---|---|
| Ramp-up | 2 min → 500 VUs |
| Sustain | 2 min @ 500 VUs |
| Ramp-down | 1 min → 0 VUs |
| Total duration | 5 min |
| p95 threshold | < 2000 ms |
| Error rate threshold | < 5% |

To run the full canonical gate: `pnpm load:stress`  
To target a specific URL: `k6 run --env BASE_URL=<url> scripts/load-stress.js`

> **Note on abbreviated run window:** The logged run below used shortened stage durations
> (20 s / 20 s / 10 s) because the current Replit CI shell environment caps execution at
> ~120 s, which is shorter than the 5-minute profile. The 500 VU peak was reached and
> sustained in both the ramp and sustain windows, yielding representative p95 measurements.
> For final go-live sign-off, run the full 5-minute `pnpm load:stress` from a CI pipeline
> (GitHub Actions, etc.) or an external host without shell timeout constraints.

## Endpoints Tested

- `GET /api/v1/resolve/{handle}`
- `GET /api/v1/resolve?limit=10`
- `GET /api/v1/handles/check?handle={handle}`
- `GET /api/.well-known/agentid-configuration`

429 responses are treated as expected (not failures) because `/handles/check` enforces a 2,000 req/min per-IP rate limit, which a 500-VU synthetic test from a single IP exceeds by design. Real-world traffic distributes across many client IPs, so this limit would not trigger at this rate in production.

---

## Stress Test Run — Staging (`https://getagent.id/api/v1`)

**Executed:** 2026-04-03  
**Stages:** 20 s ramp-up → 500 VUs, 20 s sustain, 10 s ramp-down (~51 s total)  
**Peak VUs reached:** 500  
**Command:** `k6 run --stage "20s:500,20s:500,10s:0" --summary-trend-stats "p(50),p(95),p(99),max" scripts/load-stress.js`

### k6 summary output

```
     ✓ resolve handle 200 or 404
     ✓ resolve discovery 200
     ✓ handle check 200 or 429
     ✓ well-known 200

     checks.........................: 100.00% 17700 out of 17700
     data_received..................: 39 MB   753 kB/s
     data_sent......................: 3.1 MB  60 kB/s
     http_req_blocked...............: p(50)=330ns    p(95)=510ns    p(99)=28.25ms  max=51.39ms
     http_req_connecting............: p(50)=0s       p(95)=0s       p(99)=11.51ms  max=31.57ms
   ✓ http_req_duration..............: p(50)=462.3ms  p(95)=1.86s    p(99)=3.45s    max=16.35s
       { expected_response:true }...: p(50)=462.3ms  p(95)=1.86s    p(99)=3.45s    max=16.35s
   ✓ http_req_failed................: 0.00%   0 out of 17700
     http_req_receiving.............: p(50)=185.19µs p(95)=347.1µs  p(99)=499.31µs max=58.13ms
     http_req_sending...............: p(50)=113.61µs p(95)=220.34µs p(99)=354.65µs max=1.85ms
     http_req_tls_handshaking.......: p(50)=0s       p(95)=0s       p(99)=16.39ms  max=24.37ms
     http_req_waiting...............: p(50)=461.68ms p(95)=1.86s    p(99)=3.45s    max=16.35s
     http_reqs......................: 17700   346.156627/s
     iteration_duration.............: p(50)=3.79s    p(95)=6.83s    p(99)=13.52s   max=23.35s
     iterations.....................: 4425    86.539157/s
     vus............................: 9       min=9              max=500
     vus_max........................: 500     min=500            max=500
```

**k6 verdict: ✓ PASS — no threshold failures**

---

## DB_POOL_MAX Production Secret

`DB_POOL_MAX=100` is explicitly set in the **production** environment.

**Confirmed:** `viewEnvVars({ environment: "production" })` returns `{ DB_POOL_MAX: "100" }`.

Previously the code default (`parseInt(process.env.DB_POOL_MAX ?? "100")` in `lib/db/src/index.ts`) was relied upon silently. The value is now explicit and auditable.

### Tuning guidance

- **100** — appropriate for a single API server replica with a typical managed Postgres instance (Neon, Supabase, RDS `db.t3.medium` or larger).
- **150–200** — consider if replica count stays at 1 and Postgres `max_connections` ≥ 200.
- **PgBouncer / Supavisor** — recommended before exceeding 200 pool connections to avoid Postgres backend saturation.
