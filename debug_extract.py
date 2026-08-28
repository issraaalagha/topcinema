#!/usr/bin/env python3
"""Debug 2: inspect player structure and try real play interaction."""
import asyncio
import re
import sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://down.vidtube.one/embed-1einunp7elw5.html"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = await browser.new_context(user_agent=UA, locale="en-US", viewport={"width": 1280, "height": 720})
        page = await context.new_page()

        stream_urls = []
        page.on("request", lambda r: stream_urls.append(r.url) if (".m3u8" in r.url or ".mp4" in r.url or "/hls/" in r.url or "get_file" in r.url) else None)

        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # Inspect DOM for player elements
        info = await page.evaluate("""() => {
            const out = {};
            out.videos = [...document.querySelectorAll('video')].map(v => ({src: v.src, id: v.id, cls: v.className}));
            out.iframes = [...document.querySelectorAll('iframe')].map(f => f.src);
            out.playButtons = [...document.querySelectorAll('[class*="play" i], button, .jw-icon-display, .vjs-big-play-button')].slice(0,8).map(b => ({tag: b.tagName, cls: (b.className||'').toString().slice(0,60), txt: (b.textContent||'').trim().slice(0,30)}));
            out.bodyText = document.body.innerText.slice(0, 300);
            return out;
        }""")
        import json
        print(json.dumps(info, indent=2, ensure_ascii=False)[:2500])

        # Try clicking any play-ish element
        for sel in [".jw-icon-display", ".vjs-big-play-button", "[class*='playbtn' i]", "[class*='play' i] button", "video"]:
            try:
                el = page.locator(sel).first
                if await el.count() > 0:
                    print(f"CLICKING: {sel}")
                    await el.click(timeout=3000)
                    break
            except Exception as e:
                print(f"skip {sel}: {str(e)[:80]}")

        await page.wait_for_timeout(8000)
        print("=== STREAM URLS CAPTURED ===")
        for u in stream_urls[:5]:
            print(u[:250])

        await browser.close()

asyncio.run(main())
