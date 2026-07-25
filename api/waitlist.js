import { waitlist, json, clientIp } from '../lib/db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_PER_HOUR = 10;

const trim = (v, n) => String(v ?? '').trim().slice(0, n);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }

  // Honeypot — bots fill hidden fields, humans don't. Return success so the bot
  // doesn't learn it was caught and retry with the field removed.
  if (body.website) {
    return json({ ok: true });
  }

  const email = trim(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
  }

  let col;
  try {
    col = await waitlist();
  } catch (err) {
    console.error('waitlist: db unavailable —', err.message);
    return json({ ok: false, error: 'Signups are temporarily unavailable. Please try again shortly.' }, 503);
  }

  const ip = clientIp(request);

  try {
    /*
     * Rate limit on *successful* signups only. Validation failures and repeat
     * submissions deliberately don't count, so someone who mistypes their email
     * twice doesn't get locked out — and shared IPs (offices, universities,
     * anything behind a corporate proxy) need real headroom.
     */
    if (ip !== 'unknown') {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await col.countDocuments(
        { ip, createdAt: { $gte: hourAgo } },
        { limit: MAX_PER_HOUR }
      );
      if (recent >= MAX_PER_HOUR) {
        return json(
          { ok: false, error: 'Too many signups from this network. Try again later.' },
          429
        );
      }
    }

    await col.insertOne({
      createdAt: new Date(),
      email,
      name: trim(body.name, 80),
      firm: trim(body.firm, 60),
      platform: trim(body.platform, 60),
      note: trim(body.note, 400),
      ref: trim(request.headers.get('referer'), 200),
      ua: trim(request.headers.get('user-agent'), 200),
      ip,
    });

    const count = await col.estimatedDocumentCount();
    return json({ ok: true, count });
  } catch (err) {
    // 11000 = duplicate key on the unique email index. Not an error to the user.
    if (err?.code === 11000) {
      const count = await col.estimatedDocumentCount().catch(() => undefined);
      return json({ ok: true, duplicate: true, count });
    }
    console.error('waitlist: insert failed —', err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}

// Anything other than POST
export function GET() {
  return json({ ok: false, error: 'Method not allowed. POST to this endpoint.' }, 405);
}
