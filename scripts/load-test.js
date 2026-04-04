import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 100,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 404));

const BASE_URL = __ENV.BASE_URL || "https://getagent.id/api/v1";
const TEST_HANDLE = __ENV.TEST_HANDLE || "testagent";

const machineHeaders = {
  "User-Agent": "k6-load-test/1.0 (+https://k6.io)",
  "Accept": "application/json",
};

export default function () {
  const resolveHandle = http.get(`${BASE_URL}/resolve/${TEST_HANDLE}`, {
    headers: machineHeaders,
  });
  check(resolveHandle, {
    "resolve handle 200 or 404": (r) => r.status === 200 || r.status === 404,
  });

  const resolveDiscovery = http.get(`${BASE_URL}/resolve?limit=10`, {
    headers: machineHeaders,
  });
  check(resolveDiscovery, {
    "resolve discovery 200": (r) => r.status === 200,
  });

  const handleAvailable = http.get(`${BASE_URL}/handles/check?handle=${TEST_HANDLE}`, {
    headers: machineHeaders,
  });
  check(handleAvailable, {
    "handle check 200": (r) => r.status === 200,
  });

  const wellKnown = http.get(`${BASE_URL.replace("/v1", "")}/.well-known/agentid-configuration`, {
    headers: machineHeaders,
  });
  check(wellKnown, {
    "well-known 200": (r) => r.status === 200,
  });
}
