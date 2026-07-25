import { waitlist, keyMatches, unauthorized, esc } from '../lib/db.js';

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!keyMatches(key)) return unauthorized(true);

  let rows = [];
  let dbError = null;
  try {
    const col = await waitlist();
    rows = await col.find({}, { sort: { createdAt: -1 } }).limit(5000).toArray();
  } catch (err) {
    dbError = err.message;
  }

  return new Response(page(rows, dbError, key), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

function page(rows, dbError, key) {
  const total = rows.length;
  const now = Date.now();
  const ms = (r) => new Date(r.createdAt).getTime();
  const since = (window) => rows.filter((r) => now - ms(r) < window).length;

  const byFirm = {};
  for (const r of rows) {
    const k = (r.firm || '').trim() || 'Not specified';
    byFirm[k] = (byFirm[k] || 0) + 1;
  }
  const firms = Object.entries(byFirm).sort((a, b) => b[1] - a[1]);
  const maxFirm = Math.max(1, ...firms.map((f) => f[1]));

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(now - i * 864e5).toISOString().slice(0, 10);
    days.push([key, rows.filter((r) => new Date(r.createdAt).toISOString().slice(0, 10) === key).length]);
  }
  const maxDay = Math.max(1, ...days.map((d) => d[1]));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Waitlist · ${total} signups</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#06080d;color:#e8edf7;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 18px}
.w{max-width:1100px;margin:0 auto}
h1{font-size:24px;letter-spacing:-.02em;margin-bottom:4px}
.sub{color:#5d6b87;font-size:14px;margin-bottom:26px}
.err{background:rgba(255,92,114,.08);border:1px solid rgba(255,92,114,.3);color:#ff9daa;
  padding:14px 16px;border-radius:10px;margin-bottom:24px;font-size:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:26px}
.c{background:#0e1420;border:1px solid #1e2740;border-radius:12px;padding:16px}
.c b{display:block;font-size:28px;letter-spacing:-.03em;color:#3ddc97}
.c span{font-size:12px;color:#5d6b87}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#5d6b87;margin:0 0 14px}
.panel{background:#0e1420;border:1px solid #1e2740;border-radius:12px;padding:18px;margin-bottom:20px}
.bars{display:flex;align-items:flex-end;gap:5px;height:86px}
.bar{flex:1;background:linear-gradient(180deg,#3ddc97,#1c8f5f);border-radius:3px 3px 0 0;min-height:2px;position:relative}
.bar span{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:#48566f}
.bars-wrap{padding-bottom:22px}
.firm{display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:13.5px}
.firm em{font-style:normal;width:145px;flex:none;color:#8592ad;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.firm .track{flex:1;height:8px;background:#131b2a;border-radius:4px;overflow:hidden}
.firm .fill{height:100%;background:#3ddc97;border-radius:4px}
.firm b{width:32px;text-align:right;font-size:13px}
.scroll{max-height:520px;overflow:auto;border:1px solid #1e2740;border-radius:12px}
table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:720px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #161d2e;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5d6b87;background:#0b0f18;position:sticky;top:0}
td{color:#b7c2d6}
td.em{color:#e8edf7;font-weight:500}
a.btn{display:inline-block;background:#3ddc97;color:#04150e;padding:9px 18px;border-radius:8px;
  font-weight:600;font-size:14px;text-decoration:none}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.empty{padding:44px;text-align:center;color:#5d6b87}
</style></head><body><div class="w">
<h1>Waitlist</h1>
<p class="sub">Baton · MongoDB Atlas</p>

${dbError ? `<div class="err"><b>Database unreachable.</b> ${esc(dbError)}<br>
Check <code>MONGODB_URI</code> in your Vercel environment variables, and that Atlas
Network Access allows <code>0.0.0.0/0</code>.</div>` : ''}

<div class="cards">
  <div class="c"><b>${total}</b><span>Total signups</span></div>
  <div class="c"><b>${since(864e5)}</b><span>Last 24 hours</span></div>
  <div class="c"><b>${since(7 * 864e5)}</b><span>Last 7 days</span></div>
  <div class="c"><b>${firms.length}</b><span>Distinct firms</span></div>
</div>

<div class="panel bars-wrap">
  <h2>Signups · last 14 days</h2>
  <div class="bars">
    ${days.map(([d, n]) => `<div class="bar" style="height:${(n / maxDay) * 100}%" title="${d}: ${n}"><span>${d.slice(8)}</span></div>`).join('')}
  </div>
</div>

<div class="panel">
  <h2>Prop firm / broker</h2>
  ${firms.length
    ? firms.map(([name, n]) => `<div class="firm">
        <em title="${esc(name)}">${esc(name)}</em>
        <span class="track"><span class="fill" style="width:${(n / maxFirm) * 100}%"></span></span>
        <b>${n}</b></div>`).join('')
    : '<p style="color:#5d6b87">No data yet.</p>'}
</div>

<div class="head">
  <h2 style="margin:0">All signups</h2>
  <a class="btn" href="/api/export?key=${encodeURIComponent(key)}">Download CSV</a>
</div>

<div class="scroll">
${total === 0
  ? '<p class="empty">No signups yet. Share the page.</p>'
  : `<table>
  <thead><tr><th>#</th><th>Date</th><th>Email</th><th>Name</th><th>Firm</th><th>Platform</th><th>Note</th></tr></thead>
  <tbody>
    ${rows.map((r, i) => `<tr>
      <td>${total - i}</td>
      <td>${esc(new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' '))}</td>
      <td class="em">${esc(r.email)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.firm)}</td>
      <td>${esc(r.platform)}</td>
      <td>${esc(r.note)}</td>
    </tr>`).join('')}
  </tbody></table>`}
</div>
</div></body></html>`;
}
