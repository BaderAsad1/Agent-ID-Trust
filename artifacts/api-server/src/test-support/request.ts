/**
 * Authenticated request helpers.
 *
 * These helpers build supertest request objects with the correct auth headers
 * for each strategy. They do NOT make any DB calls themselves.
 */
import type { SuperTest, Test } from "supertest";
import type { Express } from "express";
import request from "supertest";

type TestRequest = ReturnType<typeof request>;

/**
 * Create a supertest instance with X-Agent-Key header set.
 */
export function withAgentKey(app: Express, rawKey: string): TestRequest {
  return request(app).set("X-Agent-Key", rawKey) as unknown as TestRequest;
}

/**
 * Create a supertest GET request with X-Agent-Key header.
 */
export function agentKeyGet(app: Express, rawKey: string, path: string): Test {
  return request(app).get(path).set("X-Agent-Key", rawKey);
}

/**
 * Create a supertest POST request with X-Agent-Key header.
 */
export function agentKeyPost(app: Express, rawKey: string, path: string, body?: object): Test {
  const req = request(app).post(path).set("X-Agent-Key", rawKey);
  if (body) req.send(body);
  return req;
}

/**
 * Create a supertest GET request with Bearer token (session JWT or PoP JWT).
 */
export function bearerGet(app: Express, token: string, path: string): Test {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

/**
 * Create a supertest POST request with Bearer token.
 */
export function bearerPost(app: Express, token: string, path: string, body?: object): Test {
  const req = request(app).post(path).set("Authorization", `Bearer ${token}`);
  if (body) req.send(body);
  return req;
}

/**
 * Create a supertest POST request with X-Admin-Key header.
 */
export function adminPost(app: Express, adminKey: string, path: string, body?: object): Test {
  const req = request(app).post(path).set("X-Admin-Key", adminKey);
  if (body) req.send(body);
  return req;
}

/**
 * Create a supertest GET request with X-Admin-Key header.
 */
export function adminGet(app: Express, adminKey: string, path: string): Test {
  return request(app).get(path).set("X-Admin-Key", adminKey);
}
