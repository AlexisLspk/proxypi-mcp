/** User-friendly message for API errors (429, 402, etc.). */
export function formatApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // 429 Too Many Requests / rate limit
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  ) {
    return `${msg}\n\nRate limit exceeded. Try:\n  • Wait 60 seconds and retry\n  • Check your Anthropic usage tier and limits\n  • Space out requests if running many in parallel`;
  }

  // 402 / billing / quota
  if (
    lower.includes("402") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("insufficient credits")
  ) {
    return `${msg}\n\nAPI quota or billing issue. Check your Anthropic dashboard and billing settings.`;
  }

  return msg;
}
