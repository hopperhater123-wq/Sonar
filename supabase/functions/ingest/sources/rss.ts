// Quelle: RSS-News-Feeds (keyless) — Finanz-Schlagzeilen als Narrativ-Signal.
// BEST-EFFORT-Parsing: RSS-Formate variieren, wir ziehen title/link/pubDate
// per Regex (inkl. CDATA). Fehler pro Feed isoliert. Schreibt in `news`.

import { fetchText } from "../lib/http.ts";
import type { AdapterResult, NewsRow, SourceAdapter } from "../lib/types.ts";

// Kostenlose Krypto-/Finanz-Feeds. Erweiterbar ohne Codeänderung sonstwo.
const FEEDS: Array<{ name: string; url: string }> = [
  { name: "coindesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "decrypt", url: "https://decrypt.co/feed" },
];

const MAX_PER_FEED = 20;

function pick(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseFeed(xml: string, sourceName: string, capturedAt: string): NewsRow[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const rows: NewsRow[] = [];
  for (const block of items.slice(0, MAX_PER_FEED)) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    if (!title || !link) continue;
    const pub = pick(block, "pubDate");
    let publishedAt: string | null = null;
    if (pub) {
      const d = new Date(pub);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }
    rows.push({ url: link, title, source: sourceName, published_at: publishedAt, captured_at: capturedAt });
  }
  return rows;
}

export const rss: SourceAdapter = {
  name: "rss",
  async run(ctx): Promise<AdapterResult> {
    const capturedAt = ctx.now.toISOString();
    const news: NewsRow[] = [];

    for (const feed of FEEDS) {
      try {
        const xml = await fetchText(feed.url, {
          headers: { accept: "application/rss+xml, application/xml, text/xml" },
        });
        news.push(...parseFeed(xml, feed.name, capturedAt));
      } catch (_err) {
        // Einzelnen Feed überspringen — best-effort.
        continue;
      }
    }

    return { news };
  },
};
