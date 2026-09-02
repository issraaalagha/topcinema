#!/usr/bin/env python3
"""
TopCinema Local Extraction Service (Tier-1 Clean Stream Provider)
==================================================================
Runs a real Chromium browser (Playwright) on a RESIDENTIAL IP to extract
direct .m3u8/.mp4 URLs from video hosts that block datacenter traffic.

Result: the site plays video in its OWN player -> zero ads + Chromecast.

Usage:
    set EXTRACTOR_TOKEN=secret            # REQUIRED shared bearer token
    python extractor_service.py            # serves on http://127.0.0.1:8786

The service fails closed: without EXTRACTOR_TOKEN it refuses to start, and
every /extract call must send `Authorization: Bearer <token>` (the Cloudflare
function sends it from its own EXTRACTOR_TOKEN secret). Bind address defaults
to loopback — the cloudflared tunnel connector runs on the same host.
Override with EXTRACTOR_HOST only if the tunnel runs elsewhere.

Then expose it publicly (needed for the Cloudflare function to reach it):
    cloudflared tunnel --url http://127.0.0.1:8786
    -> put the printed https URL into Pages env var EXTRACTOR_URL
"""

import hmac
import ipaddress
import json
import os
import re
import socket
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import asyncio

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_OK = True
except ImportError:
    PLAYWRIGHT_OK = False

import requests

PORT = 8786
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Marker of a Dean-Edwards packed script (matched as plain text only —
# this service NEVER executes extracted content, it only regex-scans it).
PACKER_MARKER = "function(p,a,c,k,e,d)"
PACKED_BLOCK_RE = re.compile(PACKER_MARKER.replace("(", r"\(").replace(")", r"\)") + r"[\s\S]*?\)\)")
PACKED_ARGS_RE = re.compile(
    r"\}\s*\(\s*['\"](.*?)['\"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['\"](.*?)['\"]\.split\(['\"]\|['\"]\)",
    re.S,
)

BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"


# ─────────────────────────────────────────────────────────────────────────────
# SSRF guard: only public http/https hosts are allowed (per security policy)
# ─────────────────────────────────────────────────────────────────────────────

def validate_public_url(raw_url: str) -> str:
    parsed = urllib.parse.urlsplit(raw_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("only http/https URLs are allowed")
    host = parsed.hostname
    if not host:
        raise ValueError("missing hostname")

    # Reject obvious non-public names before resolving
    lowered = host.lower().rstrip(".")
    if (
        lowered in ("localhost", "localhost.localdomain")
        or lowered.endswith(".local")
        or lowered.endswith(".internal")
    ):
        raise ValueError("host is not allowed")

    # Resolve every address and reject private/loopback/reserved ranges
    default_port = 443 if parsed.scheme == "https" else 80
    for info in socket.getaddrinfo(host, parsed.port or default_port):
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise ValueError("host resolves to a non-public address")

    return raw_url


# ─────────────────────────────────────────────────────────────────────────────
# HLS master-playlist filter: force one quality + keep audio group
# (for cast apps that play a lone video rendition without sound)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_hls_master(master_url: str, referer: str) -> str:
    res = requests.get(
        master_url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": referer,
        },
        timeout=30,
    )
    res.raise_for_status()
    return res.text


def filter_hls_master(raw: str, wanted_height: int) -> str:
    """Return a master playlist containing only the audio renditions and the
    single video variant closest to `wanted_height` (never above it unless
    nothing at/below exists)."""
    lines = raw.splitlines()
    audio_lines = [l for l in lines if l.startswith("#EXT-X-MEDIA:")]

    variants = []  # (height, inf_line, url_line)
    pending_inf = None
    for line in lines:
        if line.startswith("#EXT-X-STREAM-INF:"):
            pending_inf = line
            continue
        if pending_inf and line and not line.startswith("#"):
            m = re.search(r"RESOLUTION=(\d+)x(\d+)", pending_inf)
            height = int(m.group(2)) if m else 0
            variants.append((height, pending_inf, line))
            pending_inf = None
    if not variants:
        raise ValueError("no video variants found in master playlist")

    def score(v):
        h = v[0]
        # exact/undershoot preferred; overshoot penalized heavily
        return (abs(h - wanted_height) + (5000 if h > wanted_height else 0), -h)

    best = min(variants, key=score)
    out = ["#EXTM3U", "#EXT-X-VERSION:7"]
    out.extend(audio_lines)
    out.append(best[1])
    out.append(best[2])
    return "\n".join(out) + "\n"


# ─────────────────────────────────────────────────────────────────────────────
# CineSrc permalink: /hls/<token>?cine=tv-92783-1-1&q=1080
# Resolves the cinesrc embed page to its master playlist (cached), then
# serves it filtered to a single quality + audio group.
# ─────────────────────────────────────────────────────────────────────────────

CINE_CACHE = {}  # embed_url -> (expires_epoch, master_url)
CINE_CACHE_TTL = 2 * 3600
FILTER_CACHE = {}  # (embed_url, q) -> (expires_epoch, filtered_text)
FILTER_CACHE_TTL = 30 * 60


def cinesrc_embed_from_composite(cine: str) -> str:
    m = re.match(r"^(movie|tv)-(\d+)(?:-(\d+))?(?:-(\d+))?$", cine.strip())
    if not m:
        raise ValueError("invalid cine id (expected movie-<id> or tv-<id>-<s>-<e>)")
    kind, tid, s, e = m.group(1), m.group(2), m.group(3), m.group(4)
    if kind == "movie":
        return f"https://cinesrc.st/embed/movie/{tid}"
    return f"https://cinesrc.st/embed/tv/{tid}?s={s or 1}&e={e or 1}"


def resolve_master_from_cine(embed_url: str) -> str:
    now = time.time()
    hit = CINE_CACHE.get(embed_url)
    if hit and hit[0] > now:
        return hit[1]
    url, method = ENGINE.extract(embed_url)
    if not url:
        url, method = extract_with_requests(embed_url)
    if not url:
        raise ValueError("extraction failed")
    CINE_CACHE[embed_url] = (now + CINE_CACHE_TTL, url)
    return url


def get_filtered_master(cine: str, wanted: int, referer: str) -> str:
    now = time.time()
    key = (cine, wanted)
    hit = FILTER_CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    embed_url = cinesrc_embed_from_composite(cine)
    for attempt in (1, 2):
        try:
            master = resolve_master_from_cine(embed_url)
            raw = fetch_hls_master(master, referer)
            filtered = filter_hls_master(raw, wanted)
            FILTER_CACHE[key] = (now + FILTER_CACHE_TTL, filtered)
            return filtered
        except (ValueError, requests.RequestException):
            if attempt == 2:
                raise
            CINE_CACHE.pop(embed_url, None)  # stale master — re-extract once
    raise ValueError("unreachable")


# ─────────────────────────────────────────────────────────────────────────────
# Safe text-level deobfuscation (string substitution only, never executed)
# ─────────────────────────────────────────────────────────────────────────────

def _to_base(number: int, radix: int) -> str:
    if number == 0:
        return "0"
    out = ""
    while number:
        out = BASE36_CHARS[number % radix] + out
        number //= radix
    return out


def unpack_packed_text(html: str) -> str:
    """Reverse Dean-Edwards packing via pure string replacement."""
    if PACKER_MARKER not in html:
        return html

    result = html
    for block in PACKED_BLOCK_RE.findall(html):
        args = PACKED_ARGS_RE.search(block)
        if not args:
            continue
        payload = args.group(1)
        radix = int(args.group(2))
        count = int(args.group(3))
        words = args.group(4).split("|")

        if not (2 <= radix <= 36) or count < 0 or count > 100000:
            continue

        for i in range(count - 1, -1, -1):
            if i < len(words) and words[i]:
                payload = re.sub(
                    r"\b" + re.escape(_to_base(i, radix)) + r"\b",
                    words[i].replace("\\", "\\\\"),
                    payload,
                )
        result += "\n" + payload
    return result


TRACKER_HOST_MARKS = (
    "google-analytics", "googletagmanager", "doubleclick", "googlesyndication",
    "analytics.", "/stats", "rtmark", "adnxs", "adservice", "protrafficinspector",
)


def scan_stream_urls(text: str):
    for match in re.finditer(r'https?://[^\s"\'<>\\]+', text):
        url = match.group(0)
        lowered = url.lower()

        # Skip trackers/ad endpoints entirely
        if any(mark in lowered for mark in TRACKER_HOST_MARKS):
            continue

        # The media extension must live in the PATH (before '?'), not in
        # analytics query parameters like ep=.mp4_click.
        path = lowered.split("?", 1)[0]
        if path.endswith(".m3u8") or ".m3u8/" in path + "/" or path.endswith(".mp4"):
            return match.group(0)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Playwright engine (real browser -> passes JS challenges, captures network)
# ─────────────────────────────────────────────────────────────────────────────

class BrowserEngine:
    """Owns a background asyncio loop with a persistent Chromium instance."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self._pw = None
        self._browser = None
        self.thread.start()
        if PLAYWRIGHT_OK:
            self.loop.call_soon_threadsafe(
                lambda: self.loop.create_task(self._start_browser())
            )

    async def _start_browser(self):
        try:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            )
            print("[engine] Chromium ready")
        except Exception as exc:  # noqa: BLE001 - service must survive
            print(f"[engine] Chromium failed to start: {exc}")
            self._browser = None

    async def _extract_async(self, page_url: str):
        if not self._browser:
            return None, "chromium-unavailable"

        captured = []

        context = await self._browser.new_context(
            user_agent=USER_AGENT,
            locale="en-US",
            viewport={"width": 1280, "height": 720},
        )
        try:
            page = await context.new_page()

            async def on_response(response):
                try:
                    url = response.url
                    if ".m3u8" in url or ".mp4" in url:
                        captured.append(url)
                except Exception:  # noqa: BLE001
                    pass

            page.on("response", on_response)

            try:
                await page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
            except Exception:  # noqa: BLE001 - continue with whatever loaded
                pass

            # Give the player JS time to build/request the stream
            for _ in range(12):
                if captured:
                    break
                await page.wait_for_timeout(1000)

            if not captured:
                # Fallback: scan the live DOM for stream strings
                try:
                    content = await page.content()
                    found = scan_stream_urls(content)
                    if found:
                        captured.append(found)
                except Exception:  # noqa: BLE001
                    pass
        finally:
            await context.close()

        if captured:
            # Prefer master playlists over variant playlists
            captured.sort(key=lambda u: ("chunklist" in u.lower(), len(u)))
            return captured[0], "playwright-network"
        return None, "no-stream-captured"

    def extract(self, page_url: str):
        if not PLAYWRIGHT_OK:
            return None, "playwright-not-installed"
        future = asyncio.run_coroutine_threadsafe(
            self._extract_async(page_url), self.loop
        )
        return future.result(timeout=75)


# ─────────────────────────────────────────────────────────────────────────────
# Lightweight requests fallback (hosts without JS-built streams)
# ─────────────────────────────────────────────────────────────────────────────

def extract_with_requests(page_url: str):
    try:
        resp = requests.get(
            page_url,
            headers={"User-Agent": USER_AGENT, "Referer": page_url},
            timeout=20,
        )
        html = unpack_packed_text(resp.text)
        found = scan_stream_urls(html)
        if found:
            return found, "requests-regex"
        return None, "no-match"
    except Exception as exc:  # noqa: BLE001
        return None, f"requests-error: {exc}"


# ─────────────────────────────────────────────────────────────────────────────
# HTTP layer
# ─────────────────────────────────────────────────────────────────────────────

ENGINE = BrowserEngine()
# Mandatory shared bearer token — the service refuses to start without one.
TOKEN = (os.environ.get("EXTRACTOR_TOKEN") or "").strip()
if not TOKEN:
    print("❌ EXTRACTOR_TOKEN is required (set it before starting the service)")
    raise SystemExit(1)
HOST = os.environ.get("EXTRACTOR_HOST", "127.0.0.1")


class Handler(BaseHTTPRequestHandler):
    def _send(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send({})

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlsplit(self.path)

        if parsed.path == "/health":
            return self._send({"ok": True, "chromium": bool(ENGINE._browser)})

        # /hls/<token>?cine=tv-92783-1-1&q=1080   (permalink — resolves + filters)
        # /hls/<token>?url=<master.m3u8>&q=<height>&ref=<referer>  (direct)
        # Serves a filtered master playlist (one quality + audio group) for
        # cast apps. Path token auth: cast apps cannot send headers.
        if parsed.path.startswith("/hls/"):
            path_token = parsed.path[len("/hls/"):]
            if not hmac.compare_digest(path_token, TOKEN):
                return self._send({"ok": False, "error": "unauthorized"}, 401)

            query = urllib.parse.parse_qs(parsed.query)
            referer = (query.get("ref") or ["https://cinesrc.st/"])[0]
            wanted = int((query.get("q") or ["1080"])[0])
            cine = (query.get("cine") or [""])[0]
            master_url = (query.get("url") or [""])[0]
            try:
                if cine:
                    filtered = get_filtered_master(cine, wanted, referer)
                elif master_url:
                    master_url = validate_public_url(master_url)
                    raw = fetch_hls_master(master_url, referer)
                    filtered = filter_hls_master(raw, wanted)
                else:
                    return self._send({"ok": False, "error": "missing url or cine"}, 400)
            except (ValueError, requests.RequestException) as exc:
                return self._send({"ok": False, "error": str(exc)}, 400)
            body = filtered.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.apple.mpegurl")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)

        if parsed.path != "/extract":
            return self._send({"ok": False, "error": "unknown endpoint"}, 404)

        query = urllib.parse.parse_qs(parsed.query)
        page_url = (query.get("url") or [""])[0]
        server_name = (query.get("server") or ["unknown"])[0]

        # Bearer-token auth via header (constant-time compare)
        auth_header = self.headers.get("Authorization") or ""
        if not hmac.compare_digest(auth_header.strip(), f"Bearer {TOKEN}"):
            return self._send({"ok": False, "error": "unauthorized"}, 401)

        try:
            page_url = validate_public_url(page_url)
        except ValueError as exc:
            return self._send({"ok": False, "error": f"blocked: {exc}"}, 400)

        # Tier A: real browser extraction
        url, method = ENGINE.extract(page_url)

        # Tier B: plain HTTP + regex fallback
        if not url:
            url, method = extract_with_requests(page_url)

        if url:
            return self._send({"ok": True, "url": url, "method": method})
        return self._send(
            {"ok": False, "error": "extraction failed", "method": method, "server": server_name},
            200,
        )

    def log_message(self, fmt, *args):  # quieter logs
        print(f"[http] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"🚀 TopCinema extractor service on http://{HOST}:{PORT}")
    print(f"   chromium: {'loading…' if PLAYWRIGHT_OK else 'NOT INSTALLED (pip install playwright)'}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
