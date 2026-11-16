const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET. Add a long random JWT_SECRET to backend/.env');
}

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseDuration(process.env.JWT_EXPIRES_IN || '8h');
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }));
  const unsigned = `${header}.${body}`;
  const signature = base64url(crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest());
  return `${unsigned}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, body, signature] = parts;
  const unsigned = `${header}.${body}`;
  const expected = base64url(crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid token');
  const payload = JSON.parse(fromBase64url(body));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    const err = new Error('Token expired');
    err.name = 'TokenExpiredError';
    throw err;
  }
  return payload;
}

function parseDuration(value) {
  const match = String(value).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return 8 * 60 * 60;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return amount * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit]);
}

module.exports = { signToken, verifyToken };
