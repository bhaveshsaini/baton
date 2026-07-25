/**
 * MongoDB Atlas connection for Vercel serverless functions.
 *
 * The important part is the caching. A serverless function may be invoked
 * hundreds of times on the same warm instance, and creating a MongoClient per
 * invocation opens a new connection each time — which exhausts the Atlas
 * connection limit fast (M0 free tier caps at 500). Stashing the connect()
 * promise on globalThis means warm invocations reuse one pool, and only genuine
 * cold starts pay for a handshake.
 *
 * We cache the *promise*, not the resolved client, so concurrent invocations
 * during a cold start all await the same in-flight connection instead of
 * racing to create their own.
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'baton';

const GLOBAL_KEY = '__batonMongoClientPromise';

function clientPromise() {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it in Vercel → Settings → Environment Variables.'
    );
  }
  if (!globalThis[GLOBAL_KEY]) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,               // plenty per instance; keeps well under Atlas limits
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
    });
    globalThis[GLOBAL_KEY] = client.connect();
  }
  return globalThis[GLOBAL_KEY];
}

// Indexes are idempotent but still a round trip — only do it once per instance.
let indexesReady = false;

export async function waitlist() {
  const client = await clientPromise();
  const col = client.db(dbName).collection('waitlist');

  if (!indexesReady) {
    await col.createIndexes([
      // Unique email is what makes dedupe a single write instead of a read+write.
      { key: { email: 1 }, name: 'email_unique', unique: true },
      { key: { createdAt: -1 }, name: 'createdAt_desc' },
      // Supports the per-IP rate limit lookup.
      { key: { ip: 1, createdAt: -1 }, name: 'ip_createdAt' },
    ]);
    indexesReady = true;
  }

  return col;
}

/* ------------------------------------------------------------------ helpers */

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : '').trim() || 'unknown';
}

/**
 * Constant-time-ish comparison so the admin key can't be guessed byte by byte
 * from response timing.
 */
export function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function unauthorized(html = false) {
  if (!html) return json({ ok: false, error: 'Unauthorized' }, 401);
  return new Response(
    '<body style="background:#06080d;color:#8592ad;font:15px system-ui;padding:60px;text-align:center">'
      + 'Unauthorized. Append <code style="color:#3ddc97">?key=YOUR_ADMIN_KEY</code> to the URL.</body>',
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
