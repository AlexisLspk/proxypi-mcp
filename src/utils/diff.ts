import type { ProxyRequest, RequestPatch } from "../types.js";

export function diffRequests(
  original: ProxyRequest,
  patched: ProxyRequest
): string {
  const lines: string[] = [];

  if (original.url !== patched.url) {
    lines.push(`  url:     ${original.url}`);
    lines.push(`       →   ${patched.url}`);
  }

  if (original.method !== patched.method) {
    lines.push(`  method:  ${original.method} → ${patched.method}`);
  }

  // Header diffs
  const origHeaders = original.headers ?? {};
  const patchHeaders = patched.headers ?? {};
  const allHeaderKeys = new Set([
    ...Object.keys(origHeaders),
    ...Object.keys(patchHeaders),
  ]);

  for (const key of allHeaderKeys) {
    const before = origHeaders[key];
    const after = patchHeaders[key];
    if (before !== after) {
      if (!before) lines.push(`  header:  + ${key}: ${after}`);
      else if (!after) lines.push(`  header:  - ${key}: ${before}`);
      else lines.push(`  header:  ${key}: ${before} → ${after}`);
    }
  }

  // Body diff (shallow)
  const origBody = JSON.stringify(original.body ?? null);
  const patchBody = JSON.stringify(patched.body ?? null);
  if (origBody !== patchBody) {
    lines.push(`  body:    ${origBody.slice(0, 120)}`);
    lines.push(`       →   ${patchBody.slice(0, 120)}`);
  }

  return lines.length > 0 ? lines.join("\n") : "  (no structural changes)";
}

/** Builds a clean ProxyRequest by applying a patch to the original. */
export function buildPatchedRequest(
  original: ProxyRequest,
  patch: RequestPatch
): ProxyRequest {
  return {
    url: patch.url ?? original.url,
    method: patch.method ?? original.method,
    headers: patch.headers
      ? { ...(original.headers ?? {}), ...patch.headers }
      : original.headers,
    body: patch.body !== undefined ? patch.body : original.body,
    params: patch.params
      ? { ...(original.params ?? {}), ...patch.params }
      : original.params,
  };
}

export const applyPatch = buildPatchedRequest;
