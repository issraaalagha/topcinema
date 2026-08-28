// Edge Auth Utilities for TopCinema (Zero External Dependencies)
// HMAC-signed session tokens + PBKDF2 password hashing + role system.
// Roles: owner (master passcode) > admin > viewer

export const DEFAULT_PASSCODE = '***REDACTED***';
export const DEFAULT_JWT_SECRET = '***REDACTED-ROTATED-2026-09-02***';

const PBKDF2_ITERATIONS = 100_000;

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
  const secret = env?.JWT_SECRET || DEFAULT_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const maxAge = remember ? 365 * 24 * 3600 : 24 * 3600; // 1 year or 1 day
  const payload = {
    auth: true,
    sub: session.sub || 'owner',
    role: session.role || 'owner',
    iat: now,
    exp: now + maxAge,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(secret, payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    maxAge,
  };
}

export async function verifySessionToken(token, env) {
  if (!token || !token.includes('.')) return null;
  const secret = env?.JWT_SECRET || DEFAULT_JWT_SECRET;
  const [payloadB64, sig] = token.split('.');
  try {
    const expectedSig = await hmacSha256(secret, payloadB64);
    if (sig !== expectedSig) return null;

    const payload = JSON.parse(b64urlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (e) {
    return null;
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

  // 3. From URL query parameter (for media/video player streaming)
  try {
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) return tokenParam;
  } catch {}

  return null;
}

export async function isAuthorized(request, env) {
  const token = extractToken(request);
  if (!token) return false;
  const payload = await verifySessionToken(token, env);
  return !!payload?.auth;
}

/**
 * Returns the authenticated session {sub, role} or null.
 */
export async function getSession(request, env) {
  const token = extractToken(request);
  if (!token) return null;
  const payload = await verifySessionToken(token, env);
  if (!payload?.auth) return null;
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
  return env?.PASSCODE_SECRET || DEFAULT_PASSCODE;
}
