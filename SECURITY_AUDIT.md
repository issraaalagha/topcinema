# SECURITY_AUDIT.md

- **Date:** 2026-09-02
- **Repo:** `D:\host\htdocs\topcinemaa` (Cloudflare Pages SPA + Pages Functions + Workers + local Python extractor)
- **Auditor role:** REVERSE-AUDITOR (defensive, read-only source review; no code changed, no runtime probing)
- **Commit hash:** `cda8ab924272b968e05bf426435c3f2427b7f195`

---

## System summary & trust boundaries

**Components**
- `apps/web/src` — Svelte 5 SPA (untrusted zone: everything client-side is attacker-controllable).
- `apps/web/functions/api/**` — Cloudflare Pages Functions (trust boundary edge). Holds `JWT_SECRET`, `PASSCODE_SECRET`, TMDB/OpenSubtitles keys, D1 binding `DB`.
- Datastore: Cloudflare D1 (`topcinema-db`) — users (PBKDF2 hashes), favorites, watch_history. Note: `functions/schema.sql` does not define the `users` table the code uses (see F-17).
- External upstreams (semi-trusted): `web.topcinemaa.live` / `topcinemaa.co` (scraped WordPress), `cinesrc.st`, TMDB, OpenSubtitles.
- `workers/extraction-api.js|.py` — standalone Cloudflare Worker, unauthenticated fetch relay.
- `extractor_service.py` — local Playwright service on a residential IP, intended to be exposed publicly via a cloudflared tunnel and called from the edge function (`EXTRACTOR_URL`).

**Auth model:** HMAC-SHA256 self-signed tokens `{auth, sub, role, iat, exp}` (roles viewer < admin < owner), delivered as `Authorization: Bearer`, `tc_auth` cookie, or `?token=` query param. Roles are trusted solely from the token payload, i.e. trust reduces to secrecy of `JWT_SECRET`.

**Data flow:** Browser → `/api/*` Functions → D1 / upstream scrapes → media via `/api/proxy?url=...` (open relay, see F-03) → optional residential extractor → arbitrary video hosts.

**Central gate status:** `functions/_middleware.js` is effectively disabled (F-02); all access control is per-route. Admin/user/profile routes do enforce role checks at the route level (verified, see Verified-OK).

---

## Findings

| ID | Severity | File | One-line description |
|----|----------|------|----------------------|
| F-01 | Critical | `apps/web/wrangler.toml:10-12`, `apps/web/functions/api/_auth.js:5-6` | Production JWT secret + owner passcode committed in plaintext; owner takeover |
| F-02 | High | `apps/web/functions/_middleware.js:22-23` | Central auth middleware replaced by unconditional `return next()` bypass |
| F-03 | High | `apps/web/functions/api/proxy.js:16-67` | Unauthenticated open proxy: fetches any `?url=`, follows redirects, caller-set Referer |
| F-04 | High | `workers/extraction-api.js:155-179` | Unauthenticated SSRF/fetch relay via caller-supplied `iframe_url` (Worker) |
| F-05 | Medium | `apps/web/functions/api/_auth.js:90-95` | Session token accepted from URL query string (log/referrer leakage) |
| F-06 | Medium | `apps/web/functions/api/_auth.js:42`, `auth/logout.js:10-19` | 1-year token lifetime, stateless logout, no revocation |
| F-07 | Medium | `apps/web/functions/api/auth/login.js:69-98` | No rate limiting / lockout on login incl. 4-digit master passcode |
| F-08 | Low | `apps/web/functions/api/auth/login.js:34-41` | Username enumeration via distinct error messages |
| F-09 | Medium | `apps/web/functions/api/auth/users.js:111-122,128-137` | Any admin can promote viewers to admin, reset/delete other admins (hierarchy break) |
| F-10 | Medium | `apps/web/functions/api/_utils.js:12-21`, `favorites/index.js:77`, `history/index.js:55`, `recommendations.js:89-98`, `public/sw.js:75-88` | Per-user data served `Cache-Control: public` and cached indefinitely by the service worker |
| F-11 | Medium | `apps/web/functions/api/[[path]].js:29-38` | Catch-all forwards `Authorization`/`Cookie` headers to third-party upstream |
| F-12 | Medium | `extractor_service.py:277,307,336,183` | Extractor service: optional auth, binds 0.0.0.0, Chromium `--no-sandbox`; edge caller sends no token |
| F-13 | Low | `apps/web/functions/api/_auth.js:64`, `auth/login.js:71` | Non-timing-safe HMAC signature and passcode comparisons |
| F-14 | Low | `apps/web/functions/api/_utils.js:5-10`, `proxy.js:19-25` | Wildcard `Access-Control-Allow-Origin: *` (plus `Timing-Allow-Origin: *`) on all endpoints |
| F-15 | Low | `apps/web/public/_headers`, `src/lib/player/EnhancedPlayer.svelte:298-305` | No CSP anywhere; third-party player iframe sandboxed with `allow-scripts allow-same-origin` |
| F-16 | Info | `auth/login.js:100`, `auth/users.js:143`, `admin/content.js:90`, `[[path]].js:55-59`, `catalog.js:91`, `resolve/[id]/[server].js:315` | Raw `error.message` returned to clients |
| F-17 | Info | `apps/web/functions/schema.sql:1-51` | Schema drift: `users` table absent from schema though auth depends on it |

---

### F-01 — Production auth secrets committed in plaintext; full owner takeover possible
- **Severity:** Critical
- **Evidence:** `apps/web/wrangler.toml:10-12`:
  ```toml
  [vars]
  PASSCODE_SECRET = "[REDACTED - rotated 2026-09-02]"
  JWT_SECRET = "[REDACTED - rotated 2026-09-02]"
  ```
  Duplicated at repo root `wrangler.toml:10-12`, and as in-code fallbacks `apps/web/functions/api/_auth.js:5-6` (`DEFAULT_PASSCODE = '[REDACTED - rotated 2026-09-02]'`, `DEFAULT_JWT_SECRET = '[REDACTED - rotated 2026-09-02]'`), used at `_auth.js:40` and `:60` whenever the env var is unset.
- **What the code does:** `wrangler.toml` `[vars]` are the deployed configuration for the Pages project, so these are (absent dashboard overrides — unverified) the live production values. `auth/login.js:70-96` granted `role: 'owner'` to anyone posting the 4-digit passcode; `_auth.js:39-56` signs tokens with the committed secret, so anyone who has read this repo can mint `role: 'owner'` tokens offline (`{auth:true, sub:"owner", role:"owner", ...}`) that `verifySessionToken` (`_auth.js:58-74`) will accept.
- **Impact:** Complete authentication bypass and admin/owner takeover: create users (`auth/users.js`), read/delete any user's favorites/history (`admin/content.js`), change any password.
- **Remediation direction:** Move both values to Cloudflare secrets (`wrangler pages secret put` / dashboard); make the code fail closed when secrets are absent (remove `DEFAULT_*` fallbacks); rotate `JWT_SECRET` and the passcode immediately, treating all existing tokens as compromised; purge secrets from git history.
- **Root cause:** Secrets were placed in `[vars]` (plaintext by design) instead of the secrets store, with hardcoded defaults added "so it works without config".
- **Confidence:** High.

### F-02 — Central auth middleware disabled ("temporary testing bypass")
- **Severity:** High
- **Evidence:** `apps/web/functions/_middleware.js:22-23`:
  ```js
  // Temporary Testing bypass for frictionless verification
  return next();
  ```
  with `/api/proxy` also explicitly whitelisted at line 16.
- **What the code does:** Every `/api/*` request passes through regardless of auth. The route-level checks I verified (admin/users/stats/favorites/history/recommendations) still run, but the middleware — the single choke point meant to default-deny — enforces nothing, and its comment documents that it was disabled to make verification "frictionless".
- **Impact:** No defense-in-depth: any route added without its own `getSession`/`hasRole` check ships publicly by default. Also makes security review misleading (the file reads as if gating exists).
- **Remediation direction:** Restore default-deny: after the public allowlist (`/api/auth/login`, `/api/auth/logout`, `/api/auth/verify`, content routes as decided), require `isAuthorized` and pass the session down via `context.data`; keep `/api/proxy` out of the public allowlist (see F-03).
- **Root cause:** A testing shortcut shipped to the default branch and never re-enabled; per-route checks grew as patches instead.
- **Confidence:** High.

### F-03 — Unauthenticated open proxy (SSRF-style relay) at `/api/proxy`
- **Severity:** High
- **Evidence:** `apps/web/functions/api/proxy.js:16-17` (`const targetUrl = reqUrl.searchParams.get('url')`, `ref` param), `:36-41` (only `new URL()` validity check — no scheme/host allowlist), `:44-45` (caller-controlled `ref` becomes `Referer`/`Origin`), `:63-67` (`fetch(cleanTargetUrl, { redirect: 'follow' })`), `:19-25` (`Access-Control-Allow-Origin: *`, `Timing-Allow-Origin: *`). Middleware whitelists it: `_middleware.js:16`.
- **What the code does:** Anyone on the internet can make the deployment fetch any URL (redirects followed), spoof the Referer to bypass hotlink protection, and stream the body back with wildcard CORS. The m3u8 rewriter (`:124-153`) even re-bases attacker-chosen playlists through the proxy recursively.
- **Impact:** Anonymizing proxy / bandwidth theft billed to the project; abuse of the site's IP reputation; chained use against third-party APIs (including the publicly tunneled extractor service, F-12); blind request forgery to any public host.
- **Remediation direction:** Require auth; enforce a destination allowlist (hosts already appearing in the resolver engines: vidtube, streamwish, filelions, mixdrop, cinesrc, etc.); reject or re-validate redirects against the same allowlist; HMAC-sign proxied URLs; add per-IP rate limiting.
- **Root cause:** The proxy predates the auth system (media players needed CORS-free, credential-free URLs) and was never constrained once auth landed.
- **Confidence:** High.

### F-04 — Unauthenticated SSRF relay in the extraction Worker
- **Severity:** High (if deployed — `workers/wrangler.toml` with real `account_id` suggests it is; unverified)
- **Evidence:** `workers/extraction-api.js:155-179`: `POST /api/extract` takes `iframe_url` from the JSON body and passes it to `extractVideoUrl`, which `fetch`es it (`:60-67`). No auth, no host validation anywhere in the file (`:112-127` shows `handleRequest` has no auth path). Same design in `workers/extraction-api.py:133-155`.
- **Impact:** Free fetch-and-scan proxy from Cloudflare IPs; discovery of non-extractable content is even leaked via `error`/`iframe_url` in responses; upstream abuse attribution lands on the project's account.
- **Remediation direction:** Require a shared secret header; validate `iframe_url` against the known video-host allowlist; restrict methods; consider taking the Worker offline if superseded by the Pages resolver.
- **Root cause:** Worker was built as an internal helper but exposed publicly with CORS `*` and no auth.
- **Confidence:** High (code); Medium (deployment status).

### F-05 — Session token accepted via URL query parameter
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/_auth.js:90-95`:
  ```js
  // 3. From URL query parameter (for media/video player streaming)
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) return tokenParam;
  ```
- **What the code does:** Any request with `?token=<jwt>` is authenticated as that user. Tokens end up in access logs, proxy logs, browser history, and any Referer leakage (the SPA sets `no-referrer` at `apps/web/index.html:6`, which mitigates but does not remove log/history exposure).
- **Impact:** Long-lived owner/admin tokens (see F-06) leaked via infrastructure logs or shared links compromise accounts.
- **Remediation direction:** Drop query-param extraction; if a player genuinely cannot send headers, issue short-lived single-purpose media tickets instead of the main session token.
- **Root cause:** Convenience for `<video src>`/HLS players that cannot set headers.
- **Confidence:** High.

### F-06 — 1-year tokens with no server-side revocation; logout is cosmetic
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/_auth.js:42` (`maxAge = remember ? 365*24*3600 : 24*3600`), `auth/login.js:21` default `remember = true`; `auth/logout.js:10-19` only sets `Set-Cookie: tc_auth=; Max-Age=0` — the Bearer token in `localStorage` (`src/lib/api.js:8-15`) remains valid until `exp`.
- **Impact:** A stolen/leaked token (F-05, XSS, log exposure) grants access for up to a year; password changes do not invalidate existing sessions (no token versioning); no kill-switch for compromised accounts.
- **Remediation direction:** Short access-token expiry (hours) with rotating refresh tokens; store a per-user `token_version` / revocation list in D1 or KV checked in `verifySessionToken`; invalidate sessions on password reset (`users.js:115-122`).
- **Root cause:** Stateless JWT design chosen for zero-dependency edge auth; revocation was never added.
- **Confidence:** High.

### F-07 — No brute-force protection on login; master passcode is 4 digits
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/auth/login.js:8-102` — no counter, no delay, no CAPTCHA anywhere in the file; `_middleware.js` does not throttle either. Passcode path at `:69-96` compares against `getExpectedPasscode(env)` which defaulted to a 4-character numeric code `[REDACTED - rotated 2026-09-02]` (`_auth.js:163-165`) — a 4-character numeric code.
- **Impact:** With F-01, the passcode was already public; even after rotation, unlimited online guessing of short codes/user passwords is feasible.
- **Remediation direction:** Cloudflare WAF rate-limiting on `/api/auth/login`, Turnstile/challenge after N failures, exponential per-username backoff tracked in D1, minimum passcode entropy policy.
- **Root cause:** Edge functions have no built-in rate limiting and none was layered on.
- **Confidence:** High.

### F-08 — Username enumeration via differentiated login errors
- **Severity:** Low
- **Evidence:** `apps/web/functions/api/auth/login.js:34-35` returns "الحساب غير موجود أو معطّل" (account missing/disabled) vs `:39-41` "كلمة المرور غير صحيحة" (wrong password).
- **Impact:** Attacker can enumerate valid usernames before attempting password guesses; combined with F-07 lowers attack cost.
- **Remediation direction:** Single generic "بيانات الدخول غير صحيحة" for both cases and identical timing.
- **Root cause:** UX-first error messages.
- **Confidence:** High.

### F-09 — Role hierarchy break: admins can mint admins and take over peer admin accounts
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/auth/users.js` — create path correctly requires owner for admin (`:66-68` "Only owner may mint admins"), but PATCH does not: `:111-113` `UPDATE users SET role = ? WHERE id = ?` accepts `role='admin'` from any admin; `:115-122` lets an admin reset any non-owner user's password (including another admin); DELETE `:128-137` protects only `target.role === 'owner'`.
- **What the code does:** A single compromised/malicious admin account can silently promote a colluding viewer to admin, reset every other admin's password, and log in as them — persistence the owner cannot attribute.
- **Impact:** Escalation from admin to de-facto control of all admin accounts; violates the documented invariant (`_auth.js:3` "owner (master passcode) > admin > viewer").
- **Remediation direction:** Require `hasRole(session,'owner')` for any mutation touching an admin-row (read `target.role` before update — the SELECT at `:92-95` already fetches it) and for any `role='admin'` assignment; audit-log mutations.
- **Root cause:** Owner-only rule was implemented on the CREATE path only; PATCH/DELETE were written against the generic admin gate.
- **Confidence:** High.

### F-10 — Per-user data marked publicly cacheable; service worker caches it forever
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/_utils.js:12-21` — `jsonResponse` default `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=1200`. Applied to favorites GET (`favorites/index.js:77`), history GET (`history/index.js:55`), and personalized recommendations (`recommendations.js:89-98`, TTL 600). Additionally `public/sw.js:75-88` caches every OK `/api/*` response into Cache Storage with no expiry and no purge on logout (`src/lib/api.js:71-74` logout clears only localStorage).
- **Impact:** On shared devices, user B hitting the same `?profile=<userA>` URL can be served user A's cached favorites/history (browser cache up to 5 min, SW cache indefinitely on offline fallback); `s-maxage` invites shared-cache behavior despite the data being per-user. The 403 responses are also cacheable by intermediaries.
- **Remediation direction:** For authenticated endpoints emit `Cache-Control: private, no-store` (admin endpoints already pass `maxAge=0` — e.g. `users.js:46`, `stats.js:48-49`, `admin/content.js:53` — but still say `public`, which should also be dropped); on logout, delete `/api/` entries from SW caches; exclude `/api/favorites|history|recommendations|auth` from the SW cache handler.
- **Root cause:** One shared `jsonResponse` helper tuned for public catalog data was reused for personal endpoints.
- **Confidence:** High (headers verified; cross-user serving via intermediary caches depends on cache configuration — Medium confidence for that specific vector).

### F-11 — Catch-all gateway forwards Authorization/Cookie headers to third-party upstream
- **Severity:** Medium
- **Evidence:** `apps/web/functions/api/[[path]].js:29-38`:
  ```js
  const headers = new Headers(request.headers);
  headers.set('Host', new URL(apiBase).host);
  ...
  const upstreamResponse = await fetch(targetUrl.toString(), { method: request.method, headers, ... });
  ```
  `apiBase` defaults to `https://web.topcinemaa.live` (`:3`, overridable by `env.API_UPSTREAM`).
- **What the code does:** Any `/api/*` path without a specific route relays the request — including the victim's `Authorization: Bearer <tc_auth>` and `Cookie` headers — to an external scraped site.
- **Impact:** Session-token exfiltration to a third-party host (the SPA sends the header on every `request()` call, `src/lib/api.js:18-25`); POST bodies are relayed too.
- **Remediation direction:** Strip `authorization`, `cookie`, `x-forwarded-*` from the forwarded header set; better, remove the catch-all or restrict it to an explicit path prefix list and GET only.
- **Root cause:** Legacy transparent-proxy pattern kept after auth was introduced.
- **Confidence:** High.

### F-12 — Local extractor service: optional auth, public exposure by design, unsandboxed Chromium
- **Severity:** Medium (local/tunnel threat model)
- **Evidence:** `extractor_service.py:336` `ThreadingHTTPServer(("0.0.0.0", PORT), Handler)`; docstring `:14-16` instructs exposing it via `cloudflared tunnel --url`; token optional: `:277` `TOKEN = urllib.parse.quote(os.environ.get("EXTRACTOR_TOKEN", ""))`, checked only `if TOKEN` at `:307`; the edge caller sends no token (`resolve/[id]/[server].js:167-170` sets only `User-Agent`), so in production it must run token-less to work. Chromium launched with `--no-sandbox` at `:183`.
- **What the code does:** Once tunneled, anyone who learns the URL can drive a residential-IP browser (`ENGINE.extract`, `:190-241`) to fetch arbitrary public URLs (SSRF guard `validate_public_url` `:60-91` does block private/loopback/reserved ranges — good — but resolution and fetch happen at different times, so DNS-rebinding can bypass it; hypothesis, not tested).
- **Impact:** Resource abuse from a residential machine; rendered malicious pages run in an unsandboxed Chromium (renderer exploit = host compromise); attribution of traffic to the owner's home IP.
- **Remediation direction:** Make the token mandatory and send it from the Pages function (e.g. `Authorization` header read in `_send` handler); pin the tunnel to Cloudflare Access; restore the Chromium sandbox; resolve once and pin the IP for the fetch (mitigates rebinding).
- **Root cause:** Service was built for a trusted LAN and then promoted to a public dependency of the edge function.
- **Confidence:** High (code paths); rebinding bypass is an unverified hypothesis.

### F-13 — Non-timing-safe comparisons of HMAC signature and passcode
- **Severity:** Low
- **Evidence:** `apps/web/functions/api/_auth.js:64` `if (sig !== expectedSig) return null;`; `auth/login.js:71` `String(passcode).trim() === String(expected).trim()`. (Contrast: `verifyPassword` at `_auth.js:154-161` does an XOR-accumulating constant-time-ish compare.)
- **Impact:** Theoretical timing oracle against token signatures / master passcode over high-precision repeated measurements; practically difficult behind Cloudflare, but the signature compare is the more serious of the two.
- **Remediation direction:** Compare via `crypto.subtle.verify('HMAC', ...)` on the raw signature bytes (re-deriving `expectedSig` as ArrayBuffer), and a constant-time compare for the passcode.
- **Root cause:** String equality used before a crypto-idiomatic verify was adopted elsewhere.
- **Confidence:** High (that the compares are non-constant-time); Low (exploitability).

### F-14 — Wildcard CORS (and Timing-Allow-Origin) on every endpoint
- **Severity:** Low
- **Evidence:** `apps/web/functions/api/_utils.js:5-10` `Access-Control-Allow-Origin: *` spread into every `jsonResponse`; `proxy.js:19-25` adds `'Access-Control-Allow-Headers': '*'` and `'Timing-Allow-Origin': '*'`; `[[path]].js:40-42` sets it on relayed responses.
- **Impact:** No `Access-Control-Allow-Credentials` is ever set, so cookies aren't readable cross-origin (mitigates classic CSRF/data-theft), but any script that obtains a token (F-05/F-06, XSS) can exfiltrate from any origin, and `Timing-Allow-Origin: *` aids side-channel measurement (compounds F-13).
- **Remediation direction:** Reflect a fixed allowlist of origins (the production domain(s)) instead of `*`; drop Timing-Allow-Origin.
- **Root cause:** Open-by-default headers chosen for the public streaming proxy and reused globally.
- **Confidence:** High.

### F-15 — No CSP; permissive iframe sandbox for third-party players
- **Severity:** Low
- **Evidence:** `apps/web/public/_headers:1-15` defines XFO/nosniff/Referrer-Policy for static assets but no `Content-Security-Policy` anywhere in the repo (functions add none — `_middleware.js` adds only CORS); `apps/web/src/lib/player/EnhancedPlayer.svelte:298-305` embeds scraped/untrusted hosts with `sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"`.
- **Impact:** No XSS containment layer; `allow-scripts allow-same-origin` together neutralize sandboxing guarantees for embeds and permit popups-ish behaviors and form posts inside untrusted ad-bearing pages.
- **Remediation direction:** Add a CSP (via `_headers` for static and in the middleware for `/api`), frame-src restricted to known embed hosts; drop `allow-same-origin` (and `allow-forms`) from the player sandbox unless a host is proven to need it.
- **Root cause:** Streaming embeds break under strict CSP, so none was ever defined.
- **Confidence:** High (absence verified); exploit paths depend on future XSS.

### F-16 — Internal error messages returned to clients
- **Severity:** Info
- **Evidence:** `auth/login.js:100`, `auth/users.js:143`, `admin/content.js:90`, `[[path]].js:55-59`, `catalog.js:91`, `resolve/[id]/[server].js:315` all return `error: error.message`.
- **Impact:** Leaks stack/upstream details (e.g. `Upstream error`, D1 errors) that help map internals; low direct risk.
- **Remediation direction:** Map exceptions to generic codes; log details server-side.
- **Confidence:** High.

### F-17 — Schema drift: `users` table missing from `schema.sql`
- **Severity:** Info
- **Evidence:** `apps/web/functions/schema.sql:1-51` creates only `profiles`, `favorites`, `watch_history`, `user_settings`; `auth/login.js:29-32`, `auth/users.js` (throughout), `auth/stats.js:23-24` query `users (id, username, pass_hash, salt, role, active)`.
- **Impact:** Not directly exploitable, but the auth-critical table exists only via out-of-band migration (unverified); environments rebuilt from the schema get broken auth, inviting ad-hoc "fixes" (e.g. weaker columns).
- **Remediation direction:** Add the `users` DDL (with the exact columns/unique username constraint the code assumes) to `schema.sql` and treat it as the source of truth.
- **Confidence:** High (drift verified); the deployed DB state is unverified.

---

## Verified-OK list

- **SQL injection:** every D1 statement reviewed uses prepared statements with bound parameters — `auth/login.js:30-32`, `auth/users.js:39-137`, `admin/content.js:36-82`, `favorites/index.js:53-124`, `history/index.js:37-111`, `auth/stats.js:22-35`, `recommendations.js:37-40`. No string interpolation into SQL anywhere in `functions/`.
- **Password hashing:** PBKDF2-SHA256, 100,000 iterations, 16-byte `crypto.getRandomValues` salt per user, 256-bit output (`_auth.js:127-152`), with a length-check + XOR constant-time-ish comparison (`:154-161`). (Iteration count is below current OWASP 600k guidance — hardening note, not a finding.)
- **Token integrity/expiry:** HMAC-SHA256 over the payload with `exp` enforced server-side (`_auth.js:58-74`); expired or tampered tokens return null.
- **Admin gates present per-route** (mitigating F-02 today): `auth/users.js:26-27`, `auth/stats.js:13-16`, `admin/content.js:16-19` all require `hasRole(session,'admin')` from the signed token, not client-supplied role.
- **Owner-only creation of admins on POST:** `auth/users.js:66-68`.
- **Profile isolation:** favorites/history require `profile === session.sub` (with the documented owner/`default` special case) or admin — `favorites/index.js:30-38`, `history/index.js:16-24`.
- **No dynamic code execution sinks:** no `eval`/`new Function`/`innerHTML` in `apps/web/src` or `functions` (single `innerHTML` hit is in `src/lib/player/README.md:101`, documentation). SECURITY_FIX.md's claim that `universalUnpack` was reduced to a safe pass-through holds — `resolve/[id]/[server].js:21-25` returns input unchanged; the old `unpack()` regex builder in `_utils.js:113-120` is exported but imported nowhere.
- **Third-party credentials from env only:** TMDB key/token read from `TMDB_API_KEY`/`TMDB_READ_TOKEN` with fail-fast (`_tmdb.js:11-17,51-57`); OpenSubtitles key from `OPENSUBTITLES_API_KEY`, returning 404 when unset (`subtitles/[type]/[tmdbId].js:13-15,41-44`). No upstream secret is echoed in responses.
- **Cookie hygiene:** `tc_auth` cookie set/cleared with `HttpOnly; Secure; SameSite=Lax` (`auth/login.js:62,91`, `auth/logout.js:12`), reducing CSRF exposure of state-changing endpoints (which use Bearer tokens in practice, `src/lib/api.js:18-25`).
- **SSRF guard in local extractor:** `validate_public_url` rejects non-http(s) schemes, localhost/.local/.internal names, and every resolved address in private/loopback/link-local/reserved/multicast ranges before fetching (`extractor_service.py:60-91`).
- **Legacy bridge fetch constrained:** `post/[id].js:18-21` only follows scraped URLs matching `https://(web.)?topcinemaa.(co|live)/...`; search term is URL-encoded (`:17`).
- **CI secrets handling:** `.github/workflows/deploy.yml:13-14,36-39` uses `permissions: contents: read` and GitHub secrets for the Cloudflare token; no plaintext CI credentials.
- **CineSrc resolver input is safe:** `parseCompositeId` (`_tmdb.js:218-228`) `parseInt`s the tmdb id, and `cineSrcEmbedUrl` (`:235-242`) builds only `cinesrc.st` URLs — no attacker-controlled host reaches the resolver's own fetches.
- **Static headers:** `public/_headers:1-4` sets `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` for assets; `index.html:6` sets `no-referrer` app-wide.

---

## Out of scope / unable to verify

- Whether the deployed Pages project overrides `wrangler.toml [vars]` with dashboard secrets — F-01 severity assumes the committed values are live (they are the deploy config in-repo).
- Actual D1 contents/state: existence of the `users` table, password rows, and whether `database_id 53062f22-...` matches production.
- Whether `workers/extraction-api` is actually deployed to the account in `workers/wrangler.toml` (F-04 assumes deployed).
- Runtime value/exposure of `EXTRACTOR_URL` and whether `EXTRACTOR_TOKEN` is set on the machine running `extractor_service.py`; Cloudflare Access on the tunnel.
- Cloudflare account-level protections (WAF, rate limiting, bot management) that could mitigate F-03/F-07.
- Dependency integrity: no lockfile audit performed (`package.json` lists only `hls.js`, `plyr`, Svelte/Vite tooling); `dist/` build artifacts assumed to mirror `src/`.
- DNS-rebinding bypass of `validate_public_url` (stated as hypothesis in F-12); not tested.
- `browser_extractor.py` is non-functional (syntax error at line 202, `results = `) — reliability issue, not security; noted here to avoid a noisy finding.
- No git history analysis (secret rotation state, prior leaks) — commit-level review was out of scope; secrets must be assumed historical.
