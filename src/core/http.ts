import type { ProxyRequest, ProxyResponse } from "../types.js";

export async function sendRequest(req: ProxyRequest): Promise<ProxyResponse> {
  const start = Date.now();

  // Build URL with query params
  const url = new URL(req.url);
  if (req.params) {
    for (const [k, v] of Object.entries(req.params)) {
      url.searchParams.set(k, v);
    }
  }

  const hasBody = req.body !== undefined && req.method !== "GET";

  const response = await fetch(url.toString(), {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      ...(req.headers ?? {}),
    },
    body: hasBody ? JSON.stringify(req.body) : undefined,
  });

  // Parse response body
  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }
  } catch {
    body = null;
  }

  // Collect headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body,
    durationMs: Date.now() - start,
  };
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

export function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
