import { describe, it } from "node:test";
import assert from "node:assert";
import {
  applyPatch,
  diffRequests,
} from "../utils/diff.js";
import type { ProxyRequest, RequestPatch } from "../types.js";

const baseRequest: ProxyRequest = {
  url: "https://api.example.com/v1/users",
  method: "GET",
  headers: { Authorization: "Bearer tok1" },
  body: { name: "Alice" },
  params: { page: "1" },
};

describe("applyPatch", () => {
  it("empty patch returns original unchanged", () => {
    const patch: RequestPatch = { reasoning: "no changes" };
    const result = applyPatch(baseRequest, patch);
    assert.strictEqual(result.url, baseRequest.url);
    assert.strictEqual(result.method, baseRequest.method);
    assert.deepStrictEqual(result.headers, baseRequest.headers);
    assert.deepStrictEqual(result.body, baseRequest.body);
    assert.deepStrictEqual(result.params, baseRequest.params);
  });

  it("url patch overrides url", () => {
    const patch: RequestPatch = {
      url: "https://api.example.com/v2/users",
      reasoning: "upgrade to v2",
    };
    const result = applyPatch(baseRequest, patch);
    assert.strictEqual(result.url, "https://api.example.com/v2/users");
  });

  it("headers merge (don't replace)", () => {
    const patch: RequestPatch = {
      headers: { "X-Custom": "value", "Authorization": "Bearer tok2" },
      reasoning: "add header, fix auth",
    };
    const result = applyPatch(baseRequest, patch);
    assert.strictEqual(result.headers?.Authorization, "Bearer tok2");
    assert.strictEqual(result.headers?.["X-Custom"], "value");
  });

  it("body patch overrides body", () => {
    const patch: RequestPatch = {
      body: { full_name: "Alice" },
      reasoning: "API expects full_name",
    };
    const result = applyPatch(baseRequest, patch);
    assert.deepStrictEqual(result.body, { full_name: "Alice" });
  });
});

describe("diffRequests", () => {
  it("identical requests → (no structural changes)", () => {
    const result = diffRequests(baseRequest, { ...baseRequest });
    assert.strictEqual(result, "  (no structural changes)");
  });

  it("changed url → reflected in output", () => {
    const patched = { ...baseRequest, url: "https://api.example.com/v2/users" };
    const result = diffRequests(baseRequest, patched);
    assert.ok(result.includes("v1/users"));
    assert.ok(result.includes("v2/users"));
  });

  it("changed header → reflected in output", () => {
    const patched = {
      ...baseRequest,
      headers: { ...baseRequest.headers, "X-New": "val" },
    };
    const result = diffRequests(baseRequest, patched);
    assert.ok(result.includes("X-New"));
  });
});
