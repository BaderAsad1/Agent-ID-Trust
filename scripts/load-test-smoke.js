import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "https://getagent.id/api/v1";
const TEST_HANDLE = __ENV.TEST_HANDLE || "testagent";
const TEST_AGENT_ID = __ENV.TEST_AGENT_ID || "00000000-0000-0000-0000-000000000000";
const TEST_ADDRESS = __ENV.TEST_ADDRESS || "0x0000000000000000000000000000000000000001";

export default function () {
  const resolveHandle = http.get(`${BASE_URL}/resolve/${TEST_HANDLE}`, {
    headers: { "User-Agent": "k6-smoke-test/1.0 (+https://k6.io)" },
  });
  check(resolveHandle, {
    "resolve handle responds": (r) => r.status === 200 || r.status === 404,
    "resolve handle fast": (r) => r.timings.duration < 1000,
  });

  const resolveId = http.get(`${BASE_URL}/resolve/id/${TEST_AGENT_ID}`, {
    headers: { "User-Agent": "k6-smoke-test/1.0" },
  });
  check(resolveId, {
    "resolve id responds": (r) => r.status === 200 || r.status === 404,
  });

  const discovery = http.get(`${BASE_URL}/resolve?limit=5`, {
    headers: { "User-Agent": "k6-smoke-test/1.0" },
  });
  check(discovery, {
    "discovery responds 200": (r) => r.status === 200,
  });

  const addressLookup = http.get(`${BASE_URL}/resolve/address/${TEST_ADDRESS}`, {
    headers: { "User-Agent": "k6-smoke-test/1.0" },
  });
  check(addressLookup, {
    "address lookup responds": (r) => r.status === 200 || r.status === 429,
  });
}
