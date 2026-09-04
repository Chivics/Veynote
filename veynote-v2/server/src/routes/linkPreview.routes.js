const express = require("express");
const dns = require("dns").promises;
const net = require("net");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 1_000_000; // 1MB is plenty for <head> metadata

// This endpoint fetches a URL the user pastes in, on the server, on their
// behalf. Left unguarded, that's a classic SSRF hole — a pasted URL could
// point at localhost, an internal service, or a cloud metadata endpoint
// (169.254.169.254) and the server would dutifully fetch it. Everything
// below exists to keep this to "fetch a public webpage's title" and
// nothing else: protocol allowlist, DNS-resolve-then-check the actual IP
// (not just the hostname string), no redirect-following, a timeout, and a
// response-size cap. This is a solid baseline, not a formal guarantee —
// it doesn't defend against DNS-rebinding between the lookup and the
// fetch, which would need IP-pinning at the socket layer to fully close.
function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range
  return false;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return true; // couldn't parse it — treat as unsafe
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) return response.text();
  let received = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractTitleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1]) : null;
}

function matchMeta(html, name) {
  let m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"));
  if (!m) m = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

// GET /api/link-preview?url=https://example.com
router.get("/", async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "A url is required." });

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid URL." });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https links are supported." });
  }

  let addresses;
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    return res.status(400).json({ error: "Couldn't resolve that domain." });
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    return res.status(400).json({ error: "That URL points to a restricted address." });
  }

  const fallback = { url: parsed.toString(), title: null, description: null, domain: parsed.hostname };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "manual", // don't chase redirects — the safest default against a redirect chain re-pointing at an internal address
      headers: { "User-Agent": "VeynoteLinkPreview/1.0 (link preview bot)" },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    if (response.status >= 300 && response.status < 400) return res.json(fallback);
    if (!response.ok || !contentType.includes("text/html")) return res.json(fallback);

    const html = await readCapped(response, MAX_RESPONSE_BYTES);
    const title = matchMeta(html, "og:title") || extractTitleTag(html);
    const description = matchMeta(html, "og:description") || matchMeta(html, "description");

    res.json({ ...fallback, title: title?.trim() || null, description: description?.trim() || null });
  } catch {
    // Timeout, network error, etc. — degrade to a bare domain chip rather
    // than surfacing an error for something as low-stakes as a preview.
    res.json(fallback);
  }
});

module.exports = router;
