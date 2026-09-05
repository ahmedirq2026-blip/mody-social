// Automatic quality gate: image models occasionally hallucinate garbled
// lettering onto a car or a wall. A free vision model on the same Cloudflare
// account looks at each render and we regenerate anything with text on it.
//
// The vision model needs a one-time licence acceptance on the Cloudflare
// account. Until that happens the guard reports "unavailable" and the pipeline
// carries on rather than failing.

const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const QUESTION =
  'Look carefully at this advertising photo. Does it contain ANY visible written ' +
  'text, letters, words, numbers, logos or badges anywhere in the image? ' +
  'Answer with exactly one word: YES or NO.';

let available = null;   // null = unknown, false = licence not accepted

export function guardStatus() {
  return available === null ? 'untested' : available ? 'active' : 'unavailable';
}

/** @returns {Promise<{checked:boolean, hasText:boolean, raw?:string}>} */
export async function hasVisibleText(imageB64) {
  if (available === false) return { checked: false, hasText: false };

  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: QUESTION },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageB64 } }
          ]
        }],
        max_tokens: 8
      })
    });
    const json = await res.json();

    if (!json.success) {
      const msg = json.errors?.[0]?.message ?? '';
      if (/agreement/i.test(msg)) {
        if (available === null) {
          console.log('  (text guard off: accept the model licence on Cloudflare to enable it)');
        }
        available = false;
        return { checked: false, hasText: false };
      }
      return { checked: false, hasText: false };
    }

    available = true;
    const answer = String(json.result?.response ?? '').trim().toUpperCase();
    return { checked: true, hasText: answer.startsWith('YES'), raw: answer.slice(0, 20) };
  } catch {
    return { checked: false, hasText: false };
  }
}

/** One-time licence acceptance. Only ever called when the owner asks for it. */
export async function acceptModelLicence() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'agree' })
  });
  const json = await res.json();
  return { ok: !!json.success, detail: json.errors?.[0]?.message ?? json.result ?? null };
}
