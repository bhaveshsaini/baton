import { waitlist, keyMatches, unauthorized, json } from '../lib/db.js';

const COLS = ['createdAt', 'email', 'name', 'firm', 'platform', 'note', 'ref', 'ip'];

function cell(v) {
  if (v instanceof Date) return v.toISOString();
  const s = String(v ?? '');
  // Guard against CSV injection — a leading =, +, - or @ is executed as a
  // formula when the file is opened in Excel or Sheets.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!keyMatches(key)) return unauthorized();

  try {
    const col = await waitlist();
    const rows = await col.find({}, { sort: { createdAt: 1 } }).toArray();

    const csv = [
      COLS.join(','),
      ...rows.map((r) => COLS.map((c) => cell(r[c])).join(',')),
    ].join('\r\n');

    const date = new Date().toISOString().slice(0, 10);
    return new Response('﻿' + csv, {   // BOM so Excel reads UTF-8 correctly
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="baton-waitlist-${date}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('export: failed —', err.message);
    return json({ ok: false, error: 'Export failed.' }, 500);
  }
}
