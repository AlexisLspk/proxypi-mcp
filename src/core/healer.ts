import Anthropic from "@anthropic-ai/sdk";
import type {
  ProxyRequest,
  ProxyResponse,
  RequestPatch,
  HealingRecord,
  ProxyResult,
} from "../types.js";
import { sendRequest, isSuccess, extractHost, extractPath } from "./http.js";
import { applyPatch } from "../utils/diff.js";
import { sleep } from "../utils/sleep.js";
import { recordHealing, findSimilarFix } from "../memory/store.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

const client = new Anthropic();
const MAX_ATTEMPTS = 3;

// ─── Diagnose and patch ───────────────────────────────────────────────────────

async function diagnoseAndPatch(
  originalRequest: ProxyRequest,
  currentRequest: ProxyRequest,
  errorResponse: ProxyResponse,
  attempt: number
): Promise<RequestPatch> {
  logger.info(`healing attempt ${attempt} — asking Claude to diagnose...`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are an API debugging expert. A HTTP request failed and you must fix it.

Analyze the error and return a JSON patch to correct the request. The patch fields are all optional:
- "url": corrected URL (fix path params, versioning, typos)
- "method": corrected HTTP method
- "headers": headers to add or override (e.g. fix auth format, content-type)
- "body": corrected request body (fix field names, types, required fields)
- "params": query params to add or override
- "reasoning": REQUIRED — explain exactly what was wrong and what you changed

Rules:
- Only include fields you are actually changing
- For auth errors (401): check Authorization header format
- For validation errors (422/400): fix body field names, types, or missing required fields
- For not found (404): check URL path, version prefix, or trailing slashes
- For method errors (405): fix the HTTP method
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.`,
    messages: [
      {
        role: "user",
        content: `Failed request (attempt ${attempt}):
URL: ${currentRequest.url}
Method: ${currentRequest.method}
Headers: ${JSON.stringify(currentRequest.headers ?? {}, null, 2)}
Body: ${JSON.stringify(currentRequest.body ?? null, null, 2)}
Params: ${JSON.stringify(currentRequest.params ?? {}, null, 2)}

Error response:
Status: ${errorResponse.status}
Body: ${JSON.stringify(errorResponse.body, null, 2)}`,
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "");

  try {
    return JSON.parse(raw) as RequestPatch;
  } catch {
    logger.warn("Claude returned invalid patch JSON — using empty patch");
    return { reasoning: "Parse error — no patch applied" };
  }
}

// ─── Main heal loop ───────────────────────────────────────────────────────────

export async function healingRequest(
  originalRequest: ProxyRequest
): Promise<ProxyResult> {
  const start = Date.now();
  const apiHost = extractHost(originalRequest.url);

  // First: try the request as-is
  logger.info(`sending → ${originalRequest.method} ${originalRequest.url}`);
  const firstResponse = await sendRequest(originalRequest);

  if (isSuccess(firstResponse.status)) {
    logger.done(`${firstResponse.status} in ${firstResponse.durationMs}ms`);
    return {
      success: true,
      response: firstResponse,
      healed: false,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  }

  logger.warn(
    `${firstResponse.status} — checking memory for known fix...`
  );

  // Check memory: have we fixed this before?
  const urlPath = extractPath(originalRequest.url);
  const knownFix = findSimilarFix(apiHost, firstResponse.status, urlPath);
  let currentRequest = originalRequest;
  let lastResponse = firstResponse;
  let finalPatch: RequestPatch | undefined;
  let finalDiagnosis: string | undefined;

  if (knownFix) {
    logger.info(`memory hit — applying known fix from ${new Date(knownFix.timestamp).toISOString()}`);
    currentRequest = applyPatch(originalRequest, knownFix.patch);
    finalPatch = knownFix.patch;
    finalDiagnosis = `Applied known fix: ${knownFix.patch.reasoning}`;

    const memoryResponse = await sendRequest(currentRequest);
    if (isSuccess(memoryResponse.status)) {
      logger.done(`healed via memory in ${Date.now() - start}ms`);
      return {
        success: true,
        response: memoryResponse,
        healed: true,
        attempts: 2,
        patch: finalPatch,
        diagnosis: finalDiagnosis,
        durationMs: Date.now() - start,
      };
    }
    // Memory fix didn't work — fall through to Claude
    lastResponse = memoryResponse;
    logger.warn("memory fix failed — falling back to Claude");
  }

  // Claude healing loop (with exponential backoff)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delayMs = attempt === 2 ? 500 : 1000;
      await sleep(delayMs);
    }

    const patch = await diagnoseAndPatch(
      originalRequest,
      currentRequest,
      lastResponse,
      attempt
    );

    finalPatch = patch;
    finalDiagnosis = patch.reasoning;
    currentRequest = applyPatch(currentRequest, patch);

    logger.info(`retrying with patch: ${patch.reasoning.slice(0, 80)}`);
    const retryResponse = await sendRequest(currentRequest);
    lastResponse = retryResponse;

    if (isSuccess(retryResponse.status)) {
      logger.done(
        `healed in ${attempt} attempt(s) — ${retryResponse.status} — ${Date.now() - start}ms`
      );

      // Persist to memory
      const record: HealingRecord = {
        id: randomUUID(),
        timestamp: Date.now(),
        originalRequest,
        finalRequest: currentRequest,
        patch,
        errorStatus: firstResponse.status,
        errorBody: firstResponse.body,
        apiHost,
        success: true,
        attempts: attempt + 1,
      };
      recordHealing(record);

      return {
        success: true,
        response: retryResponse,
        healed: true,
        attempts: attempt + 1,
        patch: finalPatch,
        diagnosis: finalDiagnosis,
        durationMs: Date.now() - start,
      };
    }

    logger.warn(`attempt ${attempt} failed with ${retryResponse.status}`);
  }

  // All attempts exhausted
  logger.error(`all ${MAX_ATTEMPTS} healing attempts failed`);

  // Still record the failure so we can analyse it later
  if (finalPatch) {
    recordHealing({
      id: randomUUID(),
      timestamp: Date.now(),
      originalRequest,
      finalRequest: currentRequest,
      patch: finalPatch,
      errorStatus: firstResponse.status,
      errorBody: firstResponse.body,
      apiHost,
      success: false,
      attempts: MAX_ATTEMPTS + 1,
    });
  }

  return {
    success: false,
    response: lastResponse,
    healed: false,
    attempts: MAX_ATTEMPTS + 1,
    patch: finalPatch,
    diagnosis: finalDiagnosis,
    durationMs: Date.now() - start,
  };
}
