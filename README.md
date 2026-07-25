# Baton — pre-launch landing page + waitlist

Coming-soon page for middleware that bridges trading bots to Tradovate prop-firm
accounts. Static landing page + Vercel serverless functions + MongoDB Atlas.

```
index.html        landing page (served statically at /)
api/
  waitlist.js     POST  /api/waitlist   signup
  count.js        GET   /api/count      public signup count
  admin.js        GET   /admin          dashboard (key required)
  export.js       GET   /api/export     CSV download (key required)
lib/db.js         cached Mongo connection + shared helpers
vercel.json       /admin rewrite + no-cache headers
```

## Deploy

### 1. MongoDB Atlas

1. Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user with *Read and write to any database*. Save the password.
3. **Network Access** → add `0.0.0.0/0`.
   Vercel's serverless IPs are dynamic, so an IP allowlist can't work. Access is
   controlled by the credentials in your connection string — which is why that
   string must never end up in the repo.
4. **Connect** → *Drivers* → copy the `mongodb+srv://…` URI and put your password in it.

No schema setup needed. The collection and its indexes are created on first write.

### 2. Vercel

```bash
npm i -g vercel
vercel link
```

Add two environment variables (Vercel → Settings → Environment Variables), for
Production, Preview, and Development:

| Variable | Value |
|---|---|
| `MONGODB_URI` | your `mongodb+srv://…` string |
| `ADMIN_KEY` | a long random string — `openssl rand -hex 24` |

Then:

```bash
vercel --prod
```

### 3. Local development

```bash
vercel env pull .env.local   # pulls both vars down
npm install
vercel dev                   # http://localhost:3000
```

`vercel dev` runs the functions the same way production does. Plain
`node index.html` or opening the file directly won't work — the form needs the
API routes.

## Endpoints

| Route | Method | Notes |
|---|---|---|
| `/api/waitlist` | POST | `{email, name?, firm?, platform?, note?}` |
| `/api/count` | GET | `{count}` — drives the hero counter |
| `/admin?key=` | GET | Dashboard: totals, 14-day chart, breakdown by firm |
| `/api/export?key=` | GET | CSV of every signup |

### Behaviour worth knowing

- **Dedupe** is a unique index on `email`. A repeat signup returns
  `{ok:true, duplicate:true}`, so the page says "you're already on the list"
  rather than showing an error.
- **Rate limit** is 10 *successful* signups per IP per hour. Validation failures
  and duplicates deliberately don't count — otherwise someone who mistypes their
  email twice gets locked out, and shared IPs (offices, universities, corporate
  proxies) need headroom.
- **Honeypot**: a hidden `website` field. Submissions with it set get a success
  response and are silently discarded, so bots don't learn to strip the field.
- **If the database is unreachable**, signups return 503 with a polite message,
  the counter hides itself instead of erroring, and `/admin` renders with a
  banner naming the likely cause. The real error goes to the Vercel logs only —
  connection details are never returned to the browser.

## Security notes

- **The admin key travels in the query string**, which means it appears in Vercel's
  request logs. Acceptable for a solo pre-launch waitlist; if you'd rather it
  didn't, move the check to a header or a signed cookie.
- `.env.local` and `.vercel` are gitignored. Keep the Atlas URI out of the repo —
  it contains the database password.
- The admin page sends `X-Robots-Tag: noindex, nofollow`.

## Before you launch

1. **Clear the name.** Run a trademark and domain check on "Baton" before printing
   it anywhere. If you change it, it appears in `index.html` (title, meta tags,
   nav, code samples, footer) and in `api/admin.js`.
2. **Re-verify the Tradovate facts.** The page states a $1,000 minimum balance, a
   $25/mo API add-on, and that prop/evaluation accounts aren't eligible for API
   access. That was accurate as of July 2026 per Tradovate's published
   requirements — confirm before publishing, since it's the core claim.
3. **Add real Terms and Privacy pages.** The footer links are placeholders and
   you're collecting email addresses.
4. **Wire up email.** Nothing is sent to signups right now; addresses just land in
   Atlas. Add a provider before you announce.

## Things worth thinking about

The page promises execution on prop accounts without a user API key. Worth
confirming your own technical path there before driving traffic — prop firms
disable personal Tradovate API keys, and existing tools in this space appear to
work through vendor/partner-level integration rather than user keys.

Prop firm rules also vary on automation and third-party tools. The FAQ and
disclaimer tell users to check their agreement; consider making your Terms
explicit about it too.
