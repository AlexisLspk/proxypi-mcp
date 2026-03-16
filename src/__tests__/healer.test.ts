import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import nock from "nock";
import type { ProxyRequest } from "../types.js";

// Dummy key so Anthropic client initializes; nock intercepts actual API calls
process.env.ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  "sk-ant-api03-dummykeyfortesting1234567890123456789012345678901234567890123456789012345678";

/** Fake Claude response with a valid patch for retries */
const fakeClaudePatch = {
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        headers: { "Content-Type": "application/json" },
        body: { full_name: "Bob" },
        reasoning: "API expects full_name, not name",
      }),
    },
  ],
};

// Mock Anthropic API before importing healer
nock("https://api.anthropic.com")
  .persist()
  .post(/\/v1\/messages/)
  .reply(200, fakeClaudePatch, { "content-type": "application/json" });

const { healingRequest } = await import("../core/healer.js");

describe("healer", () => {
  before(() => {
    nock.cleanAll();
    nock("https://api.anthropic.com")
      .persist()
      .post(/\/v1\/messages/)
      .reply(200, fakeClaudePatch, { "content-type": "application/json" });
  });

  after(() => {
    nock.cleanAll();
  });

  it("200 on first try → healed: false, attempts: 1", async () => {
    nock("https://api.test.com").get("/users").reply(200, { ok: true });

    const req: ProxyRequest = {
      url: "https://api.test.com/users",
      method: "GET",
    };
    const result = await healingRequest(req);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.healed, false);
    assert.strictEqual(result.attempts, 1);
  });

  it("422 then 200 → healed: true, attempts: 2", async () => {
    nock("https://api.test.com")
      .post("/users")
      .reply(422, { error: "validation failed" })
      .post("/users")
      .reply(200, { id: 1 });

    const req: ProxyRequest = {
      url: "https://api.test.com/users",
      method: "POST",
      body: { name: "Bob" },
    };
    const result = await healingRequest(req);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.healed, true);
    assert.strictEqual(result.attempts, 2);
  });

  it("three failures → success: false", async () => {
    nock("https://api.test.com")
      .get("/fail")
      .reply(500, {})
      .get("/fail")
      .reply(500, {})
      .get("/fail")
      .reply(500, {})
      .get("/fail")
      .reply(500, {});

    const req: ProxyRequest = {
      url: "https://api.test.com/fail",
      method: "GET",
    };
    const result = await healingRequest(req);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.attempts, 4); // 1 initial + 3 retries
  });
});
