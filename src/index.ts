#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { healingRequest } from "./core/healer.js";
import { getHistory, clearHistory, getStorePath } from "./memory/store.js";
import { diffRequests, buildPatchedRequest } from "./utils/diff.js";
import { formatApiError } from "./utils/api-errors.js";
import { logger, applyRainbowToBanner, colorizeBannerFooter } from "./utils/logger.js";
import type { ProxyRequest, HttpMethod } from "./types.js";

const server = new McpServer({
  name: "proxypi",
  version: "1.0.0",
});

// ─── Tool 1: proxypi_request ──────────────────────────────────────────────────
// Send a request to any REST API. Auto-heals on failure.

server.tool(
  "proxypi_request",
  `Send a request to any REST API. If the request fails, ProxyPI diagnoses the error,
patches the request using Claude, and retries automatically — up to 3 times.
Learned fixes are remembered and applied instantly next time without calling Claude.

Examples:
- GET https://api.github.com/users/torvalds
- POST https://api.stripe.com/v1/customers with a body
- Any REST endpoint with headers, body, or query params`,
  {
    url: z.string().url().describe("Full URL of the API endpoint"),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .default("GET")
      .describe("HTTP method"),
    headers: z
      .record(z.string())
      .optional()
      .describe("Request headers, e.g. { Authorization: 'Bearer token' }"),
    body: z
      .record(z.unknown())
      .optional()
      .describe("Request body (for POST/PUT/PATCH)"),
    params: z
      .record(z.string())
      .optional()
      .describe("Query string parameters"),
  },
  async ({ url, method, headers, body, params }) => {
    const request: ProxyRequest = {
      url,
      method: method as HttpMethod,
      headers,
      body,
      params,
    };

    try {
      const result = await healingRequest(request);

      const lines: string[] = [];

      // Status line
      const statusIcon = result.success ? "✅" : "❌";
      lines.push(
        `${statusIcon} ${result.response.status} — ${result.attempts} attempt(s) — ${result.durationMs}ms`
      );

      // Healing report
      if (result.healed && result.patch) {
        lines.push("");
        lines.push("**🔧 Auto-healed**");
        lines.push(`Diagnosis: ${result.diagnosis}`);
        lines.push("");
        lines.push("Diff (original → patched):");
        lines.push(diffRequests(request, buildPatchedRequest(request, result.patch)));
      }

      if (!result.success && result.diagnosis) {
        lines.push("");
        lines.push("**Last diagnosis:**");
        lines.push(result.diagnosis);
      }

      // Response body
      lines.push("");
      lines.push("**Response:**");
      lines.push("```json");
      lines.push(JSON.stringify(result.response.body, null, 2));
      lines.push("```");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      const msg = formatApiError(err);
      logger.error("proxypi_request failed", msg);
      return {
        content: [
          {
            type: "text",
            text: `ProxyPI error: ${msg}\n\nCheck that ANTHROPIC_API_KEY is set.`,
          },
        ],
      };
    }
  }
);

// ─── Tool 2: proxypi_history ──────────────────────────────────────────────────
// Show past healing records — what broke, what was fixed.

server.tool(
  "proxypi_history",
  "Show the history of auto-healed API requests. Optionally filter by API host.",
  {
    host: z
      .string()
      .optional()
      .describe(
        "Filter by API host, e.g. 'api.github.com'. Leave empty to see all."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of records to show"),
  },
  async ({ host, limit }) => {
    try {
      const records = getHistory(host).slice(-limit).reverse();

      if (records.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: host
                ? `No healing records for ${host} yet.`
                : "No healing records yet. Make some requests first.",
            },
          ],
        };
      }

      const lines: string[] = [
        `**ProxyPI healing history** (${records.length} records, stored at ${getStorePath()})`,
        "",
      ];

      for (const r of records) {
        const date = new Date(r.timestamp).toLocaleString();
        const icon = r.success ? "✅" : "❌";
        lines.push(
          `${icon} [${date}] ${r.originalRequest.method} ${r.originalRequest.url}`
        );
        lines.push(`   Error: HTTP ${r.errorStatus}`);
        lines.push(`   Fix: ${r.patch.reasoning}`);
        lines.push(`   Attempts: ${r.attempts}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      const msg = formatApiError(err);
      logger.error("proxypi_history failed", msg);
      return {
        content: [{ type: "text", text: `History failed: ${msg}` }],
      };
    }
  }
);

// ─── Tool 3: proxypi_replay ───────────────────────────────────────────────────
// Re-run a previously failed request using its stored patch.

server.tool(
  "proxypi_replay",
  "Replay a previously healed request. Useful for testing that a fix still works after an API update.",
  {
    host: z
      .string()
      .describe("API host to replay, e.g. 'api.github.com'"),
    index: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Index of the record to replay (0 = most recent)"),
  },
  async ({ host, index }) => {
    try {
      const records = getHistory(host).reverse();

      if (records.length === 0) {
        return {
          content: [
            { type: "text", text: `No records found for host: ${host}` },
          ],
        };
      }

      const record = records[index];
      if (!record) {
        return {
          content: [
            {
              type: "text",
              text: `No record at index ${index}. Only ${records.length} records available.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `**Replaying** ${record.originalRequest.method} ${record.originalRequest.url}`,
        `Original error: HTTP ${record.errorStatus}`,
        `Stored fix: ${record.patch.reasoning}`,
        "",
      ];

      const result = await healingRequest(record.finalRequest);

      const icon = result.success ? "✅" : "❌";
      lines.push(`${icon} Replay result: HTTP ${result.response.status}`);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(result.response.body, null, 2));
      lines.push("```");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      const msg = formatApiError(err);
      logger.error("proxypi_replay failed", msg);
      return {
        content: [{ type: "text", text: `Replay failed: ${msg}` }],
      };
    }
  }
);

// ─── Tool 4: proxypi_clear ────────────────────────────────────────────────────

server.tool(
  "proxypi_clear",
  "Clear all stored healing records from memory.",
  {},
  async () => {
    try {
      clearHistory();
      return {
        content: [{ type: "text", text: "✅ Healing memory cleared." }],
      };
    } catch (err) {
      const msg = formatApiError(err);
      logger.error("proxypi_clear failed", msg);
      return {
        content: [{ type: "text", text: `Clear failed: ${msg}` }],
      };
    }
  }
);

// ─── Start (banner + connect, same as dispatch-mcp) ────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const isTs = import.meta.url.endsWith(".ts");
const bannerPath = join(__dirname, isTs ? "banner.txt" : "../src/banner.txt");
try {
  const bannerRaw = readFileSync(bannerPath, "utf-8");
  const parts = bannerRaw.split("\n\n");
  const ascii = parts[0];
  const footer = parts[1]?.trim() ?? "";
  const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
  const footerWithVersion = footer.replace(/^v[\d.]+/, `v${pkg.version}`);
  process.stderr.write(applyRainbowToBanner(ascii) + "\n");
  if (footerWithVersion) process.stderr.write(colorizeBannerFooter(footerWithVersion) + "\n\n");
} catch {
  // banner optional
}

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("server ready — self-healing proxy active");
