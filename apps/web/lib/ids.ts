/**
 * crypto.randomUUID is only available in a secure context. A phone opening the
 * dev server over plain HTTP on the LAN is not secure, so fall back to a
 * non-cryptographic unique ID. Request IDs only deduplicate retries.
 */
export function createRequestId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}
