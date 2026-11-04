// Small retry helper so a transient network blip (the dreaded "fetch failed")
// doesn't surface to the user as an error. Retries only on transient failures
// — network/transport errors, 429 (rate limit), and 5xx — never on real
// client errors like a 400 or 404.

function isTransient(err) {
  const msg = (err?.message || "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("timeout")
  ) {
    return true;
  }
  const status = err?.status ?? err?.code;
  return status === 429 || (typeof status === "number" && status >= 500);
}

export async function withRetry(fn, { retries = 3, baseDelayMs = 700, label = "request" } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) break;
      const delay = baseDelayMs * attempt; // 700ms, 1400ms, ...
      console.warn(
        `[retry] ${label} failed (attempt ${attempt}/${retries}): ${err.message} — retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
