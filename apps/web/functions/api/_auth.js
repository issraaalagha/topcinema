// Edge HMAC-SHA256 Token Utilities for TopCinema (Zero External Dependencies)

export const DEFAULT_PASSCODE = '***REDACTED***';
export const DEFAULT_JWT_SECRET = '***REDACTED-ROTATED-2026-09-02***';

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

export async function createSessionToken(passcode, env, remember = true) {
  const secret = env?.JWT_SECRET || DEFAULT_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const maxAge = remember ? 365 * 24 * 3600 : 24 * 3600; // 1 year or 1 day
  const payload = {
    auth: true,
    iat: now,
    exp: now + maxAge,
  };
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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

    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
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

export function getExpectedPasscode(env) {
  return env?.PASSCODE_SECRET || DEFAULT_PASSCODE;
}
