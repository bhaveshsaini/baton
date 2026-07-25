import { waitlist, json } from '../lib/db.js';

/**
 * Public signup count — drives the "N traders waiting" line in the hero.
 * Deliberately fails quiet: if the database is unreachable the page just hides
 * the counter rather than showing an error on an otherwise fine landing page.
 */
export async function GET() {
  try {
    const col = await waitlist();
    const count = await col.estimatedDocumentCount();
    return json({ count });
  } catch (err) {
    console.error('count: unavailable —', err.message);
    return json({ count: null });
  }
}
