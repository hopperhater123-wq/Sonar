// Kleiner HTTP-Helfer: Timeout, Retry mit exponentiellem Backoff, fester
// User-Agent. Bewusst schlank gehalten — keine externe Abhängigkeit.

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
  method?: string;
  body?: string;
}

const DEFAULT_UA = "SonarIngest/0.1 (privat; Eigengebrauch)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Roh-Text holen (für RSS/XML). Wirft bei endgültigem Fehlschlag.
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 15_000, headers = {}, retries = 2, method = "GET", body } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "user-agent": DEFAULT_UA, ...headers },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const snippet = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`HTTP ${res.status} für ${url}${snippet ? ` — ${snippet}` : ""}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * 2 ** attempt); // 500ms, 1s, ...
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// JSON holen und parsen.
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, {
    ...opts,
    headers: { accept: "application/json", ...(opts.headers ?? {}) },
  });
  return JSON.parse(text) as T;
}

// Zahl robust aus String/Number ziehen ("$1,234.5" -> 1234.5). null bei Unfug.
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9eE+.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
