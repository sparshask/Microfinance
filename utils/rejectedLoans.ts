// utils/rejectedLoans.ts
// Frontend-only helpers to persist "rejected" loan IDs per chain+contract in localStorage.
// Canonicalizes chainId (decimal), accepts hex chainId keys, and normalizes contract address casing.

function normalizeAddress(a?: string) {
  return (a ?? "").toLowerCase();
}

function normalizeChainIdDecimal(chainId: string | number | null | undefined): string | null {
  if (chainId == null) return null;
  const s = String(chainId);
  if (s.startsWith("0x") || s.startsWith("0X")) {
    try { return BigInt(s).toString(); } catch { return s; }
  }
  return s;
}

function candidateKeysFor(networkIdRaw: string | number | null | undefined, contractAddressRaw: string) {
  const addr = normalizeAddress(contractAddressRaw);
  const keys: string[] = [];
  const dec = normalizeChainIdDecimal(networkIdRaw);
  if (dec) keys.push(`rejectedLoans:${dec}:${addr}`);
  if (typeof networkIdRaw === "string" && (String(networkIdRaw).startsWith("0x") || String(networkIdRaw).startsWith("0X"))) {
    keys.push(`rejectedLoans:${String(networkIdRaw)}:${addr}`);
  }
  if (networkIdRaw != null && String(networkIdRaw) !== dec) {
    keys.push(`rejectedLoans:${String(networkIdRaw)}:${addr}`);
  }
  return keys;
}

/** Read map for the first matching candidate key. Returns {} if none or parse error. */
export function getRejectedMap(networkIdRaw: string | number | null | undefined, contractAddressRaw: string) : Record<string, boolean> {
  if (!contractAddressRaw) return {};
  const keys = candidateKeysFor(networkIdRaw, contractAddressRaw);
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return parsed ?? {};
      } catch {
        continue;
      }
    } catch {
      continue;
    }
  }
  return {};
}

/** Return true if loanId is present in any candidate key map */
export function isLoanRejected(networkIdRaw: string | number | null | undefined, contractAddressRaw: string, loanId: number | string) {
  try {
    const map = getRejectedMap(networkIdRaw, contractAddressRaw);
    return !!map[String(loanId)];
  } catch {
    return false;
  }
}

/** Mark loan rejected by merging into all candidate keys (so old keys don't break) */
export function markLoanRejected(networkIdRaw: string | number | null | undefined, contractAddressRaw: string, loanId: number | string) {
  if (!contractAddressRaw) return;
  const addr = normalizeAddress(contractAddressRaw);
  const keys = candidateKeysFor(networkIdRaw, contractAddressRaw);
  if (keys.length === 0) {
    // If no chain id available, write a fallback key (so the current browser remembers something).
    const fallback = `rejectedLoans:unknown:${addr}`;
    try {
      const raw = localStorage.getItem(fallback);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      map[String(loanId)] = true;
      localStorage.setItem(fallback, JSON.stringify(map));
    } catch { /* ignore */ }
    return;
  }

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      let map: Record<string, boolean> = {};
      if (raw) {
        try { map = JSON.parse(raw); } catch { map = {}; }
      }
      map[String(loanId)] = true;
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {
      // ignore write errors
      // (some browsers throw if private mode or storage full)
    }
  }
}

/** Optional: clear for testing */
export function clearRejectedFor(networkIdRaw: string | number | null | undefined, contractAddressRaw: string) {
  const keys = candidateKeysFor(networkIdRaw, contractAddressRaw);
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch {}
  }
}
