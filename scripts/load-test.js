import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "https://getagent.id/api/v1";
const TEST_HANDLE = __ENV.TEST_HANDLE || "testagent";
const TEST_AGENT_ID = __ENV.TEST_AGENT_ID || "00000000-0000-0000-0000-000000000000";
const TEST_ADDRESS = __ENV.TEST_ADDRESS || "0x0000000000000000000000000000000000000001";

export default function () {
  const resolveHandle = http.get(`${BASE_URL}/resolve/${TEST_HANDLE}`, {
    headers: { "User-Agent": "k6-load-test/1.0 (+https://k6.io)" },
  });
  check(resolveHandle, {
    "resolve handle 200 or 404": (r) => r.status === 200 || r.status === 404,
    "resolve handle p95 < 500ms": (r) => r.timings.duration < 500,
  });

  const resolveId = http.get(`${BASE_URL}/resolve/id/${TEST_AGENT_ID}`, {
    headers: { "User-Agent": "k6-load-test/1.0" },
  });
  check(resolveId, {
    "resolve id 200 or 404": (r) => r.status === 200 || r.status === 404,
  });

  const discovery = http.get(`${BASE_URL}/resolve?limit=10`, {
    headers: { "User-Agent": "k6-load-test/1.0" },
  });
  check(discovery, {
    "discovery 200": (r) => r.status === 200,
    "discovery has agents": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.agents);
      } catch {
        return false;
      }
    },
  });

  const addressLookup = http.get(`${BASE_URL}/resolve/address/${TEST_ADDRESS}`, {
    headers: { "User-Agent": "k6-load-test/1.0" },
  });
  check(addressLookup, {
    "address lookup 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(1);
}
