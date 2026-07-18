// Quelle: Reddit (offizielle API, NUR nicht-kommerziell — Spec §11).
// Rohe Posts aus r/CryptoCurrency & r/wallstreetbets für die EIGENE
// Sentiment-Berechnung (Spec §5). Schreibt in `social_posts`.
//
// Braucht als EINZIGE Quelle Credentials. Fehlen REDDIT_CLIENT_ID/SECRET,
// wirft der Adapter — er landet dann sichtbar in sourceErrors, während alle
// anderen Quellen normal weiterlaufen.
// OAuth: client_credentials (App-only). App-Typ "web app" oder "script".

import { fetchJson } from "../lib/http.ts";
import type { AdapterResult, SocialPostRow, SourceAdapter } from "../lib/types.ts";

const SUBREDDITS = ["CryptoCurrency", "wallstreetbets"];
const LIMIT = 25;

interface TokenResponse {
  access_token?: string;
}

interface Listing {
  data?: {
    children?: Array<{
      data?: {
        name?: string;
        subreddit?: string;
        title?: string;
        selftext?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
      };
    }>;
  };
}

async function getToken(id: string, secret: string, ua: string): Promise<string> {
  const raw = await fetchJson<TokenResponse>("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": ua,
    },
    body: "grant_type=client_credentials",
  });
  if (!raw.access_token) throw new Error("kein access_token erhalten");
  return raw.access_token;
}

export const reddit: SourceAdapter = {
  name: "reddit",
  async run(ctx): Promise<AdapterResult> {
    const id = ctx.env("REDDIT_CLIENT_ID");
    const secret = ctx.env("REDDIT_CLIENT_SECRET");
    const ua = ctx.env("REDDIT_USER_AGENT") ?? "SonarIngest/0.1 (privat; Eigengebrauch)";
    if (!id || !secret) {
      throw new Error("übersprungen: REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET fehlen");
    }

    const capturedAt = ctx.now.toISOString();
    const token = await getToken(id, secret, ua);
    const socialPosts: SocialPostRow[] = [];

    for (const sub of SUBREDDITS) {
      const listing = await fetchJson<Listing>(
        `https://oauth.reddit.com/r/${sub}/hot?limit=${LIMIT}`,
        { headers: { authorization: `Bearer ${token}`, "user-agent": ua } },
      );
      for (const child of listing.data?.children ?? []) {
        const d = child.data;
        if (!d?.name) continue;
        socialPosts.push({
          external_id: d.name,
          platform: "reddit",
          subreddit: d.subreddit ?? sub,
          title: d.title ?? null,
          body: d.selftext ?? null,
          score: d.score ?? null,
          num_comments: d.num_comments ?? null,
          created_at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
          captured_at: capturedAt,
        });
      }
    }

    return { socialPosts };
  },
};
