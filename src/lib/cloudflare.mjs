// Cloudflare Workers AI - FLUX.1 [schnell]. Free allowance: 10,000 neurons/day
// (~170 images). Outputs are Apache-2.0 licensed and commercially usable.

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

export class DailyQuotaExhausted extends Error {
  constructor() {
    super('Cloudflare daily free allocation (10,000 neurons) is used up. It resets at 00:00 UTC.');
    this.name = 'DailyQuotaExhausted';
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function cfConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) {
    throw new Error('Missing CF_ACCOUNT_ID / CF_API_TOKEN. Run: npm run doctor');
  }
  return { accountId, token };
}

// The live model accepts ONLY { prompt, steps } - no seed, no width/height and no
// negative_prompt (verified against the API, the docs page is out of date).
// Output is a fixed 1024x1024 JPEG; the design templates crop it to shape.
// Variation therefore comes from the prompt matrix, and retries nudge the wording.
export const VARIATIONS = [
  '',
  ' Slightly different framing and composition.',
  ' Alternative angle, different arrangement of the elements.',
  ' A different moment of the same scene, fresh composition.'
];

/** Returns a base64-encoded JPEG string. */
export async function generateImage(prompt, { steps = 4, retries = 7, variation = 0 } = {}) {
  const finalPrompt = prompt + (VARIATIONS[variation % VARIATIONS.length] || '');
  const { accountId, token } = cfConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(120000, 3000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt.slice(0, 2048), steps })
      });

      if (res.status === 429) {
        const body = await res.clone().json().catch(() => null);
        const msg = body?.errors?.[0]?.message ?? '';
        if (/daily free allocation|free allocation of/i.test(msg)) throw new DailyQuotaExhausted();
      }
      if (res.status === 429 || res.status >= 500) {
        // Workers AI bursts are throttled; wait as long as the server asks.
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(180000, retryAfter * 1000));
        lastErr = new Error(`Cloudflare ${res.status}`);
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(`Cloudflare ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}`);
      }
      if (json.success === false) {
        throw new Error(`Cloudflare error: ${JSON.stringify(json.errors).slice(0, 300)}`);
      }
      const image = json?.result?.image ?? json?.image;
      if (!image || typeof image !== 'string') {
        throw new Error(`Unexpected Cloudflare response shape: ${JSON.stringify(json).slice(0, 300)}`);
      }
      return image;
    } catch (err) {
      // never retry a spent daily allowance - retrying cannot make it come back
      if (err instanceof DailyQuotaExhausted) throw err;
      lastErr = err;
      if (attempt === retries) break;
    }
  }
  throw new Error(`Image generation failed after ${retries + 1} attempts: ${lastErr?.message}`);
}

/** Cheap credential check used by doctor.mjs */
export async function verifyCloudflare() {
  const { accountId, token } = cfConfig();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.success !== false, status: res.status, detail: json.errors ?? null };
}
