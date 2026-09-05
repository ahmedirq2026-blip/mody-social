// Cloudflare Workers AI - FLUX.1 [schnell]. Free allowance: 10,000 neurons/day
// (~170 images). Outputs are Apache-2.0 licensed and commercially usable.

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function cfConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) {
    throw new Error('Missing CF_ACCOUNT_ID / CF_API_TOKEN. Run: npm run doctor');
  }
  return { accountId, token };
}

/** Returns a base64-encoded JPEG string. */
export async function generateImage(prompt, seed, { steps = 8, retries = 4 } = {}) {
  const { accountId, token } = cfConfig();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(30000, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps, seed })
      });

      if (res.status === 429 || res.status >= 500) {
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
