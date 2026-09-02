# BEST_PRACTICES_MAP.md

Companion reference to `D:\host\htdocs\topcinemaa\SECURITY_AUDIT.md` (audit dated 2026-09-02, commit `cda8ab9`). For each finding F-01..F-17 it records the current official remediation guidance with live, verified sources (all URLs below were fetched and confirmed on 2026-09-02, except where marked). Stack: Cloudflare Pages + Pages Functions + D1 + Workers + Svelte 5 SPA + local Playwright extractor.

## Findings → official guidance map (summary)

| Finding-ID | الممارسة (Practice) | المصدر (Source) | لماذا جذري وليس ترقيعاً (Why root-cause, not a patch) | قيد التنفيذ (Priority) |
|---|---|---|---|---|
| F-01 | Secrets store (dashboard / `wrangler pages secret put`), never `[vars]`; fail closed | Cloudflare Pages bindings + Wrangler Pages commands; CWE-798; OWASP A02/A07 | Removes the class of "committed plaintext config" and the hardcoded-default fallbacks, not just these two values | P0 |
| F-02 | Deny-by-default middleware choke point | Cloudflare Pages middleware docs; OWASP Authorization CS; CWE-862 | One centrally enforced default covers every future route; per-route checks are the patch | P1 |
| F-03 | Auth + destination allowlist + no blind redirects + signed short-lived URLs | OWASP SSRF Prevention CS; CWE-918/CWE-441; Cloudflare R2 presigned URLs (pattern) | Constrains what the proxy *is*, not which URL triggered the last abuse | P1 |
| F-04 | Shared-secret header auth + host allowlist on the relay | OWASP SSRF CS; CWE-306/CWE-918; Cloudflare Workers secrets; Access service tokens | Makes the Worker unreachable-by-design for third parties | P1 |
| F-05 | No session tokens in URLs; short-lived single-purpose media tickets instead | OWASP Session Mgmt CS (URL section); CWE-598 | Eliminates the leakage channel (logs/history/Referer), not one parameter name | P2 |
| F-06 | Short TTL + server-side revocation/token versioning + real logout | OWASP Session Mgmt CS + JWT CS; CWE-613 | Converts revocation from "impossible by design" to a supported property | P2 |
| F-07 | Rate limiting + CAPTCHA/Turnstile + lockout per account | Cloudflare WAF rate limiting rules + Turnstile; OWASP Auth CS; CWE-307 | Layered automated-attack defense at platform and app level | P2 |
| F-08 | Generic authentication error messages, uniform status/timing | OWASP Auth CS ("Authentication and Error Messages"); CWE-204 | A response contract, not a string replacement | P3 |
| F-09 | Role-hierarchy integrity: privilege-changing mutations gated on highest role | OWASP Authorization CS; CWE-266/CWE-269 | Enforces the invariant `owner > admin > viewer` on every mutation path | P2 |
| F-10 | `Cache-Control: private, no-store` for per-user data; SW must not cache `/api` | MDN Cache-Control; RFC 9111 §5.2; MDN Cache; CWE-524 | Fixes the cache policy contract for all authenticated responses | P2 |
| F-11 | Strip `Authorization`/`Cookie`/`X-Forwarded-*` before relaying; restrict the catch-all | RFC 9110 §7.6.1; CWE-200 + CWE-212 (adjusted from CWE-406, which does not fit) | Removes credential egress from the relay's design | P2 |
| F-12 | Mandatory service token, Cloudflare Access on the tunnel, keep Chromium sandbox | Cloudflare Access self-hosted app + service tokens; Chromium sandbox.md; CWE-306 | Restores machine-identity and renderer-sandbox boundaries | P2 |
| F-13 | Constant-time verification (`crypto.subtle.verify`, `timingSafeEqual`) | MDN SubtleCrypto.verify; Cloudflare Workers Web Crypto (`timingSafeEqual`); CWE-208 | Uses platform-verified constant-time primitives | P3 |
| F-14 | Origin allowlist for CORS; drop `Timing-Allow-Origin: *` | MDN CORS; MDN Timing-Allow-Origin; CWE-942 | Sets an explicit trust boundary instead of "open by default" | P3 |
| F-15 | Deploy a CSP (frame-src/`frame-ancestors`); remove `allow-same-origin` from untrusted iframe sandbox | OWASP CSP CS; MDN frame-src; MDN iframe (sandbox); CWE-693 | Adds a missing defense layer with an explicit source list | P3 |
| F-16 | Generic client errors; log details server-side (RFC 7807-style) | OWASP Error Handling CS; CWE-209 | Error-mapping policy applied centrally | P3 |
| F-17 | Treat `schema.sql` + versioned migrations as source of truth | Cloudflare D1 Migrations (`wrangler d1 migrations`); OWASP A05 | Institutionalizes migration discipline so drift cannot recur | P3 |

---

### F-01 — Secrets in `[vars]` and hardcoded defaults (Critical)
- **OWASP/CWE mapping:** A02:2021 Cryptographic Failures, A05:2021 Security Misconfiguration, A07:2021; CWE-798 (Use of Hard-coded Credentials), CWE-259 (Use of Hard-coded Password), CWE-321 (Use of Hard-coded Cryptographic Key).
- **Official reference(s):**
  - Cloudflare Pages Docs — *Functions > Bindings > Secrets* (includes the caution "Do not use `vars` to store sensitive information in your Worker's Wrangler configuration file. Use secrets instead"): https://developers.cloudflare.com/pages/functions/bindings/
  - Cloudflare Wrangler Docs — *Pages commands* (`pages secret put|list|delete|bulk`): https://developers.cloudflare.com/workers/wrangler/commands/pages/
  - Cloudflare Workers Docs — *Secrets* (same `[vars]` warning; `.dev.vars` for local dev, gitignore it): https://developers.cloudflare.com/workers/configuration/secrets/
  - CWE-798: https://cwe.mitre.org/data/definitions/798.html
  - Note: the older URL `developers.cloudflare.com/pages/configuration/environment-variables/` now returns 404; the bindings page above is the current home of the secrets guidance (verified 2026-09-02).
- **Canonical remediation:**
  - Create `JWT_SECRET` and `PASSCODE_SECRET` as encrypted bindings via dashboard (Settings → Variables and Secrets → Encrypt) or `wrangler pages secret put` — not `[vars]`, which is plaintext by design.
  - Delete the in-code `DEFAULT_JWT_SECRET`/`DEFAULT_PASSCODE` fallbacks; fail closed (500/503) when a required secret is absent.
  - Rotate both values immediately and treat every previously issued token as compromised (revocation per F-06 makes rotation effective).
  - Use `.dev.vars` (gitignored) for local development, matching the documented Pages workflow.
  - Purge the values from git history; treat them as public since the repo has been readable.
- **Priority:** P0

### F-02 — Disabled central auth middleware (High)
- **OWASP/CWE mapping:** A01:2021 Broken Access Control; CWE-862 (Missing Authorization).
- **Official reference(s):**
  - Cloudflare Pages Docs — *Functions > Middleware* (`_middleware.js`, `context.next()`, middleware applies to all Functions in its directory and subdirectories; root middleware runs in front of all routes; a middleware may short-circuit by returning its own `Response` instead of calling `next()`): https://developers.cloudflare.com/pages/functions/middleware/
  - OWASP Authorization Cheat Sheet (deny-by-default; "globally enforced mechanisms (filters, middleware) rather than per-method checks"): https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
  - CWE-862: https://cwe.mitre.org/data/definitions/862.html
- **Canonical remediation:**
  - Restore `functions/_middleware.js` as a default-deny choke point: verify the session first and only `return next()` for an explicit public allowlist (login/verify/logout, decided public content routes).
  - Return 401/403 from the middleware directly (documented short-circuit pattern) instead of calling `next()`.
  - Propagate the verified session via `context.data` so route handlers stop re-parsing tokens.
  - Keep the per-route `hasRole` checks as defense-in-depth — the OWASP position is that authorization must be enforced globally *and* validated per request.
  - Never ship temporary bypasses to the default branch; CI should fail on a deny-bypass pattern in `_middleware.js`.
- **Priority:** P1

### F-03 — Unauthenticated open proxy `/api/proxy` (High)
- **OWASP/CWE mapping:** A10:2021 Server-Side Request Forgery (SSRF); CWE-918 (SSRF), CWE-441 (Unintended Proxy / "Confused Deputy").
- **Official reference(s):**
  - OWASP Server Side Request Forgery Prevention Cheat Sheet (prefer allowlists over denylists; validate scheme/domain/IP; "disable the support for the following of the redirection in your web client"; resolve once and pin to mitigate DNS rebinding): https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
  - OWASP Top 10 2021 — A10 SSRF: https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/
  - CWE-918: https://cwe.mitre.org/data/definitions/918.html ; CWE-441: https://cwe.mitre.org/data/definitions/441.html
  - Cloudflare R2 Docs — *Presigned URLs* (the official Cloudflare pattern for temporary, signed, expiring media URLs; short expirations recommended because the URL is a bearer token): https://developers.cloudflare.com/r2/api/s3/presigned-urls/
  - Cloudflare WAF — *Rate limiting rules* (abuse/bandwidth control in front of the proxy): https://developers.cloudflare.com/waf/rate-limiting-rules/
- **Canonical remediation:**
  - Require authentication for `/api/proxy` and remove it from any public middleware allowlist.
  - Enforce a strict destination allowlist (scheme `https` only + exact known media hosts), matched on the resolved URL.
  - Do not blindly follow redirects: disable/limit `redirect: 'follow'` and re-validate every hop against the same allowlist (OWASP SSRF CS).
  - Replace the open URL parameter with short-lived, HMAC-signed, single-purpose media tickets (the same bearer-token-with-expiry pattern Cloudflare documents for R2 presigned URLs), so a shared URL is worthless after minutes.
  - Add per-IP rate limiting via a WAF rate-limiting rule on the proxy path.
- **Priority:** P1

### F-04 — Unauthenticated SSRF relay in the extraction Worker (High)
- **OWASP/CWE mapping:** A10:2021 SSRF, A07:2021; CWE-918 (SSRF), CWE-306 (Missing Authentication for Critical Function).
- **Official reference(s):**
  - OWASP SSRF Prevention Cheat Sheet (same allowlist/redirect rules as F-03): https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
  - Cloudflare Workers Docs — *Secrets* (shared-secret stored as an encrypted binding, read as `env.X`): https://developers.cloudflare.com/workers/configuration/secrets/
  - Cloudflare Zero Trust Docs — *Service tokens* (Cloudflare's official machine-to-machine auth pattern: `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers, Service Auth policy, rotation with grace period): https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
  - CWE-306: https://cwe.mitre.org/data/definitions/306.html
- **Canonical remediation:**
  - Require a shared-secret header on every `/api/extract` request; store the secret with `wrangler secret put` on the Worker side and as a Pages secret on the caller side — never in `[vars]` (F-01 pattern).
  - Validate caller-supplied `iframe_url` against the known video-host allowlist before any fetch; restrict accepted methods (POST only) and body size.
  - Remove wildcard CORS; restrict to the Pages origin or drop it entirely since the caller is server-to-server.
  - The Cloudflare-native alternative is to put the Worker behind Cloudflare Access with a Service Auth policy (service tokens), which provides rotation and revocation out of the box.
  - If the Pages resolver has superseded this Worker, decommission it — an unused public relay is pure attack surface.
- **Priority:** P1

### F-05 — Session token accepted from URL query string (Medium)
- **OWASP/CWE mapping:** A07:2021; CWE-598 — note: renamed in CWE 4.20 (April 2026) from "Use of GET Request Method With Sensitive Query Strings" to "Use of HTTP Request With Sensitive Query String": https://cwe.mitre.org/data/definitions/598.html
- **Official reference(s):**
  - OWASP Session Management Cheat Sheet — session IDs exchanged in URLs "might disclose the session ID (in web links and logs, web browser history and bookmarks, the Referer header or search engines)"; cookies are the preferred exchange mechanism: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  - OWASP JWT Cheat Sheet — "Token reuse can be mitigated by using short expiration time in the JWT" (short-lived single-purpose tokens): https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html (this sheet was renamed from "JSON Web Token for Java"; the old slug 404s — verified)
- **Canonical remediation:**
  - Remove the `?token=` extraction branch from token resolution entirely; accept only `Authorization: Bearer` and the HttpOnly cookie.
  - Where a media player genuinely cannot send headers, issue a separate short-lived (minutes), single-purpose, proxy-scoped ticket — never the primary session token (F-03 signed-URL pattern).
  - Keep `Referrer-Policy: no-referrer` (already present) as defense-in-depth, not as the control.
- **Priority:** P2

### F-06 — 1-year tokens, stateless logout, no revocation (Medium)
- **OWASP/CWE mapping:** A07:2021; CWE-613 (Insufficient Session Expiration).
- **Official reference(s):**
  - OWASP Session Management Cheat Sheet — idle timeouts 15–30 min for low-risk apps; absolute timeouts in the 4–8 h range; "Session timeout management and expiration must be enforced server-side"; logout must invalidate server-side; session renewal required after "password changes, permission changes, or switching from a regular user role to an administrator role": https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  - OWASP JWT Cheat Sheet — revocation via a server-side denylist keyed on `jti`/`iss` stored with the token's `exp` (entries purge themselves at expiry); "Using the raw JWT or a secure hash of the JWT ... as the denylist key is not safe"; short expiry; sender-constrained tokens (DPoP) as advanced option: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html
  - CWE-613: https://cwe.mitre.org/data/definitions/613.html
- **Canonical remediation:**
  - Reduce access-token lifetime to hours (OWASP: 4–8 h absolute); drop `remember = true` as default.
  - Add a per-user `token_version` (or `jti` denylist) column/table in D1 checked during token verification; increment it on logout-all, password change, and role change — this is the documented denylist/versioning revocation model.
  - Make logout invalidate server-side (bump `token_version`), not just clear the cookie; also purge client caches (see F-10).
  - Long-lived sessions, if kept, must rotate/re-issue the token rather than extending the same one.
- **Priority:** P2

### F-07 — No brute-force protection on login (Medium)
- **OWASP/CWE mapping:** A07:2021; CWE-307 (Improper Restriction of Excessive Authentication Attempts).
- **Official reference(s):**
  - Cloudflare WAF Docs — *Rate limiting rules* (docs explicitly cite "protect a login endpoint from brute-force attacks" as a primary use case; match on path, threshold, mitigation timeout): https://developers.cloudflare.com/waf/rate-limiting-rules/ (parameters: .../rate-limiting-rules/parameters/; dashboard creation: .../rate-limiting-rules/create-zone-dashboard/)
  - Cloudflare Turnstile Docs (managed CAPTCHA alternative; verify client-side widget + server-side validation; Pre-clearance for SPAs): https://developers.cloudflare.com/turnstile/
  - OWASP Authentication Cheat Sheet — lockout counters "should be associated with the account itself, rather than the source IP address"; exponential lockout durations; CAPTCHA only as a defense-in-depth layer triggered after a few failures: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - CWE-307: https://cwe.mitre.org/data/definitions/307.html
- **Canonical remediation:**
  - Add a Cloudflare WAF rate-limiting rule on `/api/auth/login` (path + IP, small threshold, block/managed-challenge action).
  - Add Turnstile (managed widget) to the login flow with server-side siteverify, triggered after N failures per OWASP guidance.
  - Track per-account failed-attempt counters in D1 (not IP-only) with exponential backoff; the same applies to the master-passcode path.
  - Enforce a minimum-entropy policy for the master passcode so "4 digits" is impossible by construction.
- **Priority:** P2

### F-08 — Username enumeration via distinct login errors (Low)
- **OWASP/CWE mapping:** A07:2021; CWE-204 (Observable Response Discrepancy).
- **Official reference(s):**
  - OWASP Authentication Cheat Sheet — "Authentication and Error Messages": respond generically for wrong user, wrong password, missing or disabled account ("Login failed; Invalid user ID or password."); keep HTTP status and response shape identical; avoid the "quick exit" timing discrepancy by running the same work on all paths: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - CWE-204: https://cwe.mitre.org/data/definitions/204.html
- **Canonical remediation:**
  - Return one generic message for all login failure modes, same HTTP status, same response body shape.
  - Equalize work (perform the hash computation even for unknown users) so timing does not reveal account existence.
- **Priority:** P3

### F-09 — Role hierarchy break in admin PATCH/DELETE (Medium)
- **OWASP/CWE mapping:** A01:2021 Broken Access Control; CWE-266 (Incorrect Privilege Assignment), CWE-269 (Improper Privilege Management).
- **Official reference(s):**
  - OWASP Authorization Cheat Sheet — deny-by-default; least privilege applied "both horizontally and vertically"; "an attacker only needs to find one way in", so authorization must be validated on every request and centrally enforced; log authorization decisions: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
  - CWE-266: https://cwe.mitre.org/data/definitions/266.html ; CWE-269: https://cwe.mitre.org/data/definitions/269.html
- **Canonical remediation:**
  - Any mutation that (a) assigns `role='admin'` or (b) modifies/deletes a row whose current role is `admin` must require `owner` — read `target.role` first (the existing SELECT already fetches it) and gate on it before UPDATE/DELETE.
  - Express the rule as data: the acting role must be strictly higher than the target role for any mutation (owner-only tier for admin targets).
  - Renew/revoke the target's sessions after role or password changes (ties into F-06 token versioning; OWASP requires session renewal on permission changes).
  - Audit-log all role/password mutations (OWASP A09 practice) so owner-account takeovers are attributable.
- **Priority:** P2

### F-10 — Per-user data served `Cache-Control: public` + SW infinite cache (Medium)
- **OWASP/CWE mapping:** A05:2021 Security Misconfiguration; CWE-524 (Use of Cache Containing Sensitive Information).
- **Official reference(s):**
  - MDN — *Cache-Control*: add `private` for "user-personalized content, especially for responses received after login"; `no-store` prevents any cache from storing the response; `public` explicitly unlocks shared-cache storage even for `Authorization` requests: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
  - RFC 9111 (HTTP Caching), §5.2 (definitions of `private` / `no-store`; responses to `Authorization` requests are not shared-cached unless directives permit): https://www.rfc-editor.org/rfc/rfc9111.html
  - MDN — *Cache* (Cache Storage): "The caching API doesn't honor HTTP caching headers"; "Items in a Cache ... don't expire unless deleted"; "You are responsible for periodically purging cache entries": https://developer.mozilla.org/en-US/docs/Web/API/Cache
  - CWE-524: https://cwe.mitre.org/data/definitions/524.html
- **Canonical remediation:**
  - Authenticated, per-user endpoints must emit `Cache-Control: private, no-store` (drop `public`, `s-maxage`, `stale-while-revalidate` there); reserve the public catalog caching for genuinely public routes only.
  - Exclude `/api/favorites`, `/api/history`, `/api/recommendations`, `/api/auth` (and all of `/api/` except decided-public catalog GETs) from the service worker cache handler.
  - On logout, delete `/api/` entries from Cache Storage (SW caches do not expire on their own and do not honor response headers — MDN Cache).
  - Never cache non-OK (401/403) responses in the SW at all.
- **Priority:** P2

### F-11 — Catch-all forwards `Authorization`/`Cookie` to third-party upstream (Medium)
- **OWASP/CWE mapping:** A01/A05; CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor), CWE-212 (Improper Removal of Sensitive Information Before Storage or Transfer — current CWE 4.20 title; formerly "Improper Cross-boundary Removal of Sensitive Data").
- **Mapping adjustment:** the audit's suggested CWE-406 ("Insufficient Control of Network Message Volume") does not describe this weakness; CWE-212 is the precise fit (verified: https://cwe.mitre.org/data/definitions/212.html).
- **Official reference(s):**
  - RFC 9110 (HTTP Semantics), §7.6.1 "Hop-by-Hop Header Fields" — hop-by-hop headers are consumed by the immediate connection and must not be forwarded by proxies; `Authorization`/`Cookie` are end-to-end fields a proxy forwards only as a deliberate design decision: https://www.rfc-editor.org/rfc/rfc9110.html
  - CWE-200: https://cwe.mitre.org/data/definitions/200.html
- **Canonical remediation:**
  - Build the forwarded header set as an explicit allowlist (method-appropriate safe headers only); always strip `authorization`, `cookie`, and `x-forwarded-*` before relaying to any third-party host.
  - Restrict the `[[path]].js` catch-all to an explicit path-prefix allowlist and GET only — or remove it and route each upstream explicitly.
  - Pin the upstream host server-side; never allow caller input to select the destination (also mitigates confused-deputy misuse, CWE-441).
- **Priority:** P2

### F-12 — Local extractor: optional auth, public tunnel, `--no-sandbox` Chromium (Medium)
- **OWASP/CWE mapping:** A07:2021, A05:2021; CWE-306 (Missing Authentication for Critical Function); DNS-rebinding exposure analyzed under CWE-918/OWASP SSRF CS.
- **Official reference(s):**
  - Cloudflare Zero Trust Docs — *Access > Self-hosted applications* (put an Access authentication layer in front of a tunneled origin; applications are "deny by default"; enable "Protect with Access" on the tunnel so requests are validated): https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
  - Cloudflare Zero Trust Docs — *Service tokens* (m2m credentials sent as `CF-Access-Client-Id`/`CF-Access-Client-Secret`; rotation with grace period; revocation by deletion): https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
  - Cloudflare Zero Trust Docs — *Cloudflare Tunnel / connect networks* (outbound-only connector model, no inbound ports): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
  - Chromium Docs — *Sandbox* (design doc; "Assume sandboxed code is malicious code"; renderers handle untrusted web content inside the sandbox "barring a `--no-sandbox` flag"): https://chromium.googlesource.com/chromium/src/+/HEAD/docs/design/sandbox.md
  - OWASP SSRF Prevention Cheat Sheet — DNS-rebinding mitigation: resolve once, validate all resolved addresses, pin the IP for the subsequent fetch: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- **Canonical remediation:**
  - Make the extractor token mandatory and send it from the Pages function; better, front the tunnel with Cloudflare Access using a Service Auth policy so only the Pages identity reaches the service.
  - Bind the listener to loopback (not `0.0.0.0`); the tunnel connector provides the only path in.
  - Remove `--no-sandbox`: per Chromium's design docs the sandbox is the boundary that assumes rendered content is malicious.
  - Resolve the target host once, validate every resolved address, and pin the IP for the actual fetch (OWASP DNS-rebinding guidance) — closes the TOCTOU gap noted in the audit.
- **Priority:** P2

### F-13 — Non-timing-safe HMAC/passcode comparison (Low)
- **OWASP/CWE mapping:** CWE-208 (Observable Timing Discrepancy).
- **Official reference(s):**
  - MDN — *SubtleCrypto.verify()*: recompute-and-compare verification returning a boolean (`verify(algorithm, key, signature, data)`; for HMAC pass `"HMAC"`, the secret `CryptoKey`, signature bytes, and data): https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
  - Cloudflare Workers Docs — *Web Crypto*: HMAC is fully supported for `sign()`/`verify()`; Cloudflare also ships the non-standard `crypto.subtle.timingSafeEqual(a, b)` — "Compare two buffers in a way that is resistant to timing attacks": https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
  - OWASP Authentication Cheat Sheet — timing-discrepancy warning for authentication paths: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - CWE-208: https://cwe.mitre.org/data/definitions/208.html
- **Canonical remediation:**
  - Verify the token signature with `crypto.subtle.verify('HMAC', key, sigBytes, dataBytes)` instead of string equality; the comparison happens inside the Web Crypto implementation.
  - For the passcode (and any remaining raw comparisons), use the Workers-provided `crypto.subtle.timingSafeEqual` on fixed-length encodings, or the existing XOR-accumulate pattern used by `verifyPassword`.
  - Do not hand-roll new constant-time compare variants; use the platform primitive (also compounds favorably with removing `Timing-Allow-Origin: *`, F-14).
- **Priority:** P3

### F-14 — Wildcard `Access-Control-Allow-Origin` and `Timing-Allow-Origin` (Low)
- **OWASP/CWE mapping:** A05:2021; CWE-942 (Permissive Cross-domain Policy with Untrusted Domains).
- **Official reference(s):**
  - MDN — *CORS*: "When responding to a credentialed request, the server must specify an origin in the value of the Access-Control-Allow-Origin header, instead of specifying the * wildcard"; the no-wildcard rule likewise applies to `Access-Control-Allow-Headers`/`-Methods` (which the proxy currently sets to `*`): https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
  - MDN — *Timing-Allow-Origin*: header exists to grant specific origins access to Resource Timing values otherwise reported as zero; values are `*` or an explicit origin list: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Timing-Allow-Origin
  - CWE-942: https://cwe.mitre.org/data/definitions/942.html
- **Canonical remediation:**
  - Replace `Access-Control-Allow-Origin: *` with a fixed allowlist of the production origin(s); reflect an origin only when it matches the allowlist; remove `Access-Control-Allow-Headers: *`.
  - Drop `Timing-Allow-Origin` unless a specific first-party origin needs Resource Timing granularity; never send it on `/api/proxy` responses to third-party origins.
  - Keep the no-credentials posture (`Access-Control-Allow-Credentials` unset) — it is what currently limits wildcard blast radius.
- **Priority:** P3

### F-15 — No CSP; iframe `sandbox="allow-scripts allow-same-origin ..."` (Low)
- **OWASP/CWE mapping:** CWE-693 (Protection Mechanism Failure).
- **Official reference(s):**
  - OWASP Content Security Policy Cheat Sheet — prefer a strict nonce/hash policy (`script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`); minimum fallback `default-src 'self'; frame-ancestors 'self'; form-action 'self'`; `frame-ancestors` governs who may embed you and supersedes X-Frame-Options: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
  - MDN — *CSP frame-src*: "specifies valid sources for nested browsing contexts loaded using elements such as `<frame>` and `<iframe>`" (fallback chain frame-src → child-src → default-src): https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-src
  - MDN — *iframe sandbox*: it is "strongly discouraged to use both `allow-scripts` and `allow-same-origin`, as that lets the embedded document remove the sandbox attribute — making it no more secure than not using the sandbox attribute at all": https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe
  - CWE-693: https://cwe.mitre.org/data/definitions/693.html
- **Canonical remediation:**
  - Ship a CSP: `default-src 'self'` baseline, `frame-src` restricted to the exact known embed hosts (the inventory produced by the F-03 allowlist), `object-src 'none'`, `frame-ancestors 'self'`, `form-action 'self'`; deliver via `_headers` for static assets and the middleware for `/api`.
  - Remove `allow-same-origin` (and `allow-forms`) from the player iframe sandbox; keep only what playback requires (`allow-scripts`, `allow-presentation`).
  - Where a host is proven to need more, grant it per-host via `frame-src` partitioning, not by weakening the global sandbox.
  - Migrate toward a strict CSP (nonces) for first-party scripts per OWASP current practice; allowlist CSPs are the fallback, and overly permissive ones are bypass-prone.
- **Priority:** P3

### F-16 — Internal `error.message` returned to clients (Info)
- **OWASP/CWE mapping:** CWE-209 (Generation of Error Message Containing Sensitive Information).
- **Official reference(s):**
  - OWASP Error Handling Cheat Sheet — "a generic response is returned by the application but the error details are logged server side for investigation"; avoid content that "would reveal implementation details"; structured APIs should use RFC 7807 Problem Details and correct 4xx/5xx separation: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
  - CWE-209: https://cwe.mitre.org/data/definitions/209.html
- **Canonical remediation:**
  - Map exceptions to generic client-facing error codes/messages at a single central helper (middleware or `jsonResponse`), never returning `error.message`.
  - Log the full error server-side (Cloudflare Workers observability/tail logs) with a correlation ID echoed to the client.
  - Use appropriate status classes: 4xx for client errors, 5xx for genuine server faults, and monitor 5xx rates per OWASP guidance.
- **Priority:** P3

### F-17 — `users` table missing from `schema.sql` (schema drift) (Info)
- **OWASP/CWE mapping:** A05:2021 Security Misconfiguration (configuration/schema drift). No single CWE precisely captures schema drift; treat as a process weakness rather than forcing an ill-fitting CWE.
- **Official reference(s):**
  - Cloudflare D1 Docs — *Migrations*: version the schema with SQL migration files created, listed, and applied via `wrangler d1 migrations create|list|apply` against the named database: https://developers.cloudflare.com/d1/reference/migrations/ (command reference: https://developers.cloudflare.com/d1/wrangler-commands/)
  - OWASP Top 10 2021 — A05 Security Misconfiguration: https://owasp.org/Top10/2021/A05_2021-Security_Misconfiguration/
- **Canonical remediation:**
  - Add the `users` DDL (exact columns, `username` uniqueness, role/active constraints the code assumes) to version-controlled SQL and treat `schema.sql` + `migrations/` as the only source of truth.
  - Bootstrap new environments exclusively with `wrangler d1 migrations apply` (including the `token_version` migration from F-06) so drift is structurally impossible.
  - Add a CI step that applies the schema to a scratch D1 database and smoke-tests login — drift then fails the build instead of inviting ad-hoc runtime "fixes".
- **Priority:** P3

## Implementation order

1. **F-01** — Rotate `JWT_SECRET` + master passcode, move to the secrets store, delete hardcoded fallbacks, purge git history. Everything else assumes the current secrets are burned.
2. **F-17 + F-06** — Establish D1 migration discipline and add `token_version`; shorten token TTL; make logout/rotation actually revoke. The migration framework from F-17 is what carries the F-06 schema change, and revocation is what makes step 1's rotation enforceable.
3. **F-02** — Restore the `_middleware.js` deny-by-default gate (needs working auth from steps 1–2 to test); keep per-route checks as defense-in-depth.
4. **F-11** — Strip `Authorization`/`Cookie`/`X-Forwarded-*` from the catch-all relay and restrict it. One-file change that stops live credential exfiltration; independent of everything above.
5. **F-03** — Lock `/api/proxy`: require auth, host allowlist, no blind redirects, signed short-lived media tickets.
6. **F-05** — Remove `?token=` support (depends on step 5's ticket path so `<video>`/HLS players keep working).
7. **F-04 → F-12** — Add shared-secret header auth to the extraction Worker, then make the extractor token mandatory, front the tunnel with Cloudflare Access, restore the Chromium sandbox. F-12 depends on F-04's secret-distribution pattern.
8. **F-07** — WAF rate-limiting rule on `/api/auth/login` + Turnstile + per-account lockout and passcode-entropy policy (post-rotation, step 1).
9. **F-09** — Gate admin-row mutations and `role='admin'` assignment on `owner`; add audit logging.
10. **F-10** — `private, no-store` on all authenticated endpoints; exclude `/api` from the service worker; purge caches on logout (complements F-06 logout).
11. **F-14** — Replace wildcard CORS/TAO with an origin allowlist (origins are stable once proxies are locked in step 5).
12. **F-08 + F-16** — Central generic-error mapping (single helper fixes both enumeration and internal-detail leaks with uniform timing).
13. **F-13** — Switch HMAC verification to `crypto.subtle.verify` / `timingSafeEqual`.
14. **F-15** — Deploy CSP with `frame-src` allowlist built from step 5's host inventory, and drop `allow-same-origin`/`allow-forms` from the player sandbox (last because strict CSP requires the embed-host set to be final).

## Sources list

- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/workers/wrangler/commands/pages/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/pages/functions/middleware/
- https://developers.cloudflare.com/waf/rate-limiting-rules/
- https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/
- https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/
- https://developers.cloudflare.com/turnstile/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
- https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
- https://owasp.org/Top10/2021/ (and category pages, e.g. https://owasp.org/Top10/2021/A01_2021-Broken_Access_Control/ ; note https://owasp.org/Top10/ now redirects to Top 10:2025)
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
- https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Timing-Allow-Origin
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-src
- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe
- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
- https://developer.mozilla.org/en-US/docs/Web/API/Cache
- https://www.rfc-editor.org/rfc/rfc9111.html (RFC 9111, §5.2 Cache-Control)
- https://www.rfc-editor.org/rfc/rfc9110.html (RFC 9110, §7.6.1 Hop-by-Hop Header Fields)
- https://chromium.googlesource.com/chromium/src/+/HEAD/docs/design/sandbox.md
- CWE pages (pattern https://cwe.mitre.org/data/definitions/{id}.html, all cited IDs follow it): 798, 259, 321, 862, 918, 441, 306, 598, 613, 307, 204, 266, 269, 524, 200, 212, 208, 942, 693, 209 — CWE-441, CWE-212 and CWE-598 were individually fetched and confirmed (including the CWE 4.20 rename of CWE-598).
