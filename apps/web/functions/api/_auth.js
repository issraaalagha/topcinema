// Edge Auth Utilities for TopCinema (Zero External Dependencies)
// HMAC-signed session tokens + PBKDF2 password hashing + role system.
// Roles: owner (master passcode) > admin > viewer
//
// Fail-closed: JWT_SECRET / PASSCODE_SECRET must be provided as encrypted
// bindings (`wrangler pages secret put` / dashboard). Tokens cannot be signed
// or verified — and the master passcode cannot match — when they are absent.

const PBKDF2_ITERATIONS = 100_000;

// SESSION_TTL: OWASP recommends short server-enforced lifetimes; 7 days for
// "remember me" and 1 day otherwise (previously 1 year / 1 day with no
// revocation path — see SECURITY_AUDIT.md F-06).
const REMEMBER_TTL = 7 * 24 * 3600;
const SESSION_TTL = 24 * 3600;

/** Length-checked, constant-time-ish string comparison (same pattern as verifyPassword). */
export function safeEqual(a, b) {
  const aStr = String(a);
  const bStr = String(b);
  if (aStr.length !== bStr.length) return false;
  let diff = 0;
  for (let i = 0; i < aStr.length; i++) diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  return diff === 0;
}

// Generate HMAC-SHA256 signature using Web Crypto API (native in Cloudflare Workers)
async function hmacSha256(keyStr, dataStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataStr));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

/**
 * Session token. `session = { sub, role }` — sub is the username
 * ('owner' for master-passcode logins), role one of owner|admin|viewer.
 */
export async function createSessionToken(session, env, remember = true) {
  const secret = env?.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const maxAge = remember ? REMEMBER_TTL : SESSION_TTL;
  const payload = {
    auth: true,
    sub: session.sub || 'owner',
    role: session.role || 'owner',
    iat: now,
    exp: now + maxAge,
  };
  // Server-side revocation: user sessions embed the token_version they were
  // minted with (bumped on password/role changes); owner passcode sessions
  // have no backing row and carry no version.
  if (session.ver !== undefined) payload.ver = session.ver;
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(secret, payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    maxAge,
  };
}

export async function verifySessionToken(token, env) {
  if (!token || !token.includes('.')) return null;
  const secret = env?.JWT_SECRET;
  if (!secret) return null; // fail closed when the signing secret is absent
  const [payloadB64, sig] = token.split('.');
  try {
    const expectedSig = await hmacSha256(secret, payloadB64);
    if (!safeEqual(sig, expectedSig)) return null;

    const payload = JSON.parse(b64urlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Short-lived, proxy-scoped media ticket (never a session token). Issued to
 * authenticated users so <video>/HLS/cast receivers that cannot send headers
 * can still stream through /api/proxy without tokens in long-lived URLs.
 */
const MEDIA_TICKET_TTL = 4 * 3600;

export async function createMediaTicket(env, ttlSeconds = MEDIA_TICKET_TTL) {
  const secret = env?.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = b64urlEncode(JSON.stringify({ mt: 1, iat: now, exp: now + ttlSeconds }));
  const sig = await hmacSha256(secret, payloadB64);
  return { ticket: `${payloadB64}.${sig}`, expiresIn: ttlSeconds };
}

export async function verifyMediaTicket(ticket, env) {
  if (!ticket || !ticket.includes('.')) return false;
  const secret = env?.JWT_SECRET;
  if (!secret) return false;
  const [payloadB64, sig] = ticket.split('.');
  try {
    const expectedSig = await hmacSha256(secret, payloadB64);
    if (!safeEqual(sig, expectedSig)) return false;
    const payload = JSON.parse(b64urlDecode(payloadB64));
    if (payload.mt !== 1) return false;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export function extractToken(request) {
  // 1. From Authorization Header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. From Cookie
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)tc_auth=([^;]+)/);
    if (match) return match[1];
  }

  // No URL query fallback: session tokens must never appear in URLs
  // (logs/history/Referer leakage — SECURITY_AUDIT.md F-05). Media playback
  // that cannot send headers uses the proxy-scoped media ticket instead.
  return null;
}

/**
 * Returns the authenticated session {sub, role} or null.
 */
export async function getSession(request, env) {
  const token = extractToken(request);
  if (!token) return null;
  const payload = await verifySessionToken(token, env);
  if (!payload?.auth) return null;

  // Revocation check: a versioned session dies when its user's token_version
  // moves (password/role change) or the row disappears/deactivates.
  if (payload.ver !== undefined && env?.DB) {
    try {
      const row = await env.DB
        .prepare('SELECT token_version, active FROM users WHERE username = ? LIMIT 1')
        .bind(payload.sub)
        .first();
      if (!row || !row.active) return null;
      if ((row.token_version || 0) !== payload.ver) return null;
    } catch (e) {
      // Degrade to signature-only auth if the DB/schema is unavailable
      // (e.g. pre-migration database) — never lock everyone out on a query
      // error. The enforcement path is the successful read above.
      console.error('[auth] token_version check failed:', e?.message || e);
    }
  }
  return { sub: payload.sub || 'owner', role: payload.role || 'owner' };
}

const ROLE_RANK = { viewer: 1, admin: 2, owner: 3 };

export function hasRole(session, minimum) {
  if (!session) return false;
  return (ROLE_RANK[session.role] || 0) >= (ROLE_RANK[minimum] || 99);
}

// ── PBKDF2 password hashing (Web Crypto, Workers-native) ───────────────────

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const key = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: Uint8Array.from(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16))),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, saltHex, expectedHash) {
  const hash = await hashPassword(password, saltHex);
  // Constant-time-ish comparison
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

export function getExpectedPasscode(env) {
  // Fail closed: without PASSCODE_SECRET no master-passcode login is possible.
  return env?.PASSCODE_SECRET || null;
}
