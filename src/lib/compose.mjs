// Turns a deterministic "combo" into everything one post needs:
// the image prompt, the on-image copy, the network captions and the hashtags.

import { pick, shuffle, mulberry32, hashString } from './random.mjs';
import {
  VEHICLES, COLORS, SETTINGS, LIGHTING, ANGLES, SERVICE_SCENES,
  buildImagePrompt, KICKERS, CTAS, HEADLINES, SUBLINES, PROOF_CHIPS,
  SUNDAY_COPY, HASHTAGS
} from './matrix.mjs';

const LAYOUTS = ['panel', 'scrim', 'glass'];

/** A balanced service order: every service used evenly, never twice in a row. */
export function serviceSequence(rng, days, services) {
  const out = [];
  let pool = [];
  for (let i = 0; i < days; i++) {
    if (!pool.length) pool = shuffle(rng, services);
    let next = pool.shift();
    if (out.length && next === out[out.length - 1] && pool.length) {
      const swap = pool.shift();
      pool.unshift(next);
      next = swap;
    }
    out.push(next);
  }
  return out;
}

export function buildCombo(rng, serviceId) {
  const scene = pick(rng, SERVICE_SCENES[serviceId]);
  const vehicle = pick(rng, VEHICLES);
  const color = pick(rng, COLORS);
  const setting = pick(rng, SETTINGS);
  const lighting = pick(rng, LIGHTING);
  const angle = pick(rng, ANGLES);
  const combo = { serviceId, scene, vehicle, color, setting, lighting, angle };
  const id = hashString([serviceId, scene, vehicle, color, setting, lighting, angle].join('|')).toString(16);
  return { ...combo, comboId: id, prompt: buildImagePrompt(combo) };
}

export function buildCopy(rng, { serviceId, isSunday, brand, index }) {
  const headlinePool = HEADLINES[serviceId];
  const subPool = SUBLINES[serviceId];

  let headline, sub;
  if (isSunday) {
    const s = pick(rng, SUNDAY_COPY);
    headline = s.h;
    sub = s.s;
  } else {
    headline = pick(rng, headlinePool);
    sub = pick(rng, subPool);
  }

  return {
    eyebrow: pick(rng, KICKERS),
    kicker: `${brand.business.city}, ${brand.business.state}`,
    chip: pick(rng, PROOF_CHIPS),
    headline,
    sub,
    cta: isSunday ? 'Plan Your Visit' : pick(rng, CTAS),
    footer: ['4533 St Barnabas Rd', 'Mon–Sat 9–5', 'modycarwash.com'],
    layout: LAYOUTS[index % LAYOUTS.length]
  };
}

export function buildHashtags(rng, serviceId) {
  const tags = [
    ...shuffle(rng, HASHTAGS.local).slice(0, 3),
    ...shuffle(rng, HASHTAGS.core).slice(0, 4),
    ...shuffle(rng, HASHTAGS[serviceId]).slice(0, 3),
    '#ModyCarWash'
  ];
  return shuffle(rng, [...new Set(tags)]);
}

export function buildCaptions(rng, { copy, serviceId, brand, hashtags, isSunday }) {
  const b = brand.business;
  const service = brand.services.find(s => s.id === serviceId);
  const hook = `${copy.headline[0]} ${copy.headline[1]}`;
  const proof = pick(rng, brand.proofPoints);

  const social = [
    hook,
    '',
    copy.sub,
    isSunday ? '' : `${service.name} — ${service.blurb}`,
    '',
    `✅ ${proof}`,
    '',
    `📍 ${b.address}`,
    `🕘 ${b.hours} · Closed Sundays`,
    `📞 ${b.phoneDisplay}`,
    `🔗 ${b.website}`,
    '',
    hashtags.join(' ')
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Google Business Profile: no phone numbers in body text, hashtags are not
  // linked, hard cap 1,500 characters.
  const gbp = [
    hook,
    '',
    copy.sub,
    isSunday ? '' : `${service.name}: ${service.blurb}`,
    '',
    `${proof}.`,
    `Visit us at ${b.address}. Open ${b.hours}, closed Sundays.`,
    `Serving ${b.areas.slice(0, 4).join(', ')}.`
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1490);

  return { social, gbp };
}

export function buildPost({ monthKey, slot, index, serviceId, brand, salt = '' }) {
  const rng = mulberry32(hashString(`${monthKey}|${slot.day}|${serviceId}|${salt}`));
  const combo = buildCombo(rng, serviceId);
  const copy = buildCopy(rng, { serviceId, isSunday: slot.isSunday, brand, index });
  const hashtags = buildHashtags(rng, serviceId);
  const captions = buildCaptions(rng, { copy, serviceId, brand, hashtags, isSunday: slot.isSunday });
  const seed = hashString(`${monthKey}|${combo.comboId}|${salt}`) % 4294967295;

  return {
    day: slot.day,
    dueAt: slot.dueAt,
    localLabel: slot.localLabel,
    isSunday: slot.isSunday,
    serviceId,
    comboId: combo.comboId,
    seed,
    prompt: combo.prompt,
    layout: copy.layout,
    copy,
    hashtags,
    captions
  };
}
