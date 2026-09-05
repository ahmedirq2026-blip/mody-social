// Small JSON store on disk. history.json is what guarantees that no image
// or copy combination is ever reused, across months and across years.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = path.join(ROOT, 'data');
export const POSTS = path.join(ROOT, 'posts');

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

const HISTORY = path.join(DATA, 'history.json');
const POSTED = path.join(DATA, 'posted.json');
const planFile = (monthKey) => path.join(DATA, 'plans', `${monthKey}.json`);

export const loadHistory = () => readJson(HISTORY, { combos: {}, hashes: [], headlines: {} });
export const saveHistory = (h) => writeJson(HISTORY, h);

export const loadPosted = () => readJson(POSTED, {});
export const savePosted = (p) => writeJson(POSTED, p);

export const loadPlan = (monthKey) => readJson(planFile(monthKey), null);
export const savePlan = (monthKey, plan) => writeJson(planFile(monthKey), plan);

export async function listPlans() {
  const { readdir } = await import('node:fs/promises');
  try {
    const files = await readdir(path.join(DATA, 'plans'));
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
  } catch { return []; }
}

/** Public base URL for the committed images. */
export function pagesBaseUrl() {
  if (process.env.PAGES_BASE_URL) return process.env.PAGES_BASE_URL.replace(/\/+$/, '');
  const repo = process.env.GITHUB_REPOSITORY;           // "owner/name"
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

export function imageUrl(relPath) {
  const base = pagesBaseUrl();
  if (!base) throw new Error('Cannot build image URL: set PAGES_BASE_URL or run inside GitHub Actions.');
  return `${base}/${relPath.replace(/^\/+/, '')}`;
}

/** The oldest month whose plan has fewer posts than the month has days. */
export async function findIncompleteMonth() {
  for (const key of await listPlans()) {
    const [y, m] = key.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const plan = await loadPlan(key);
    if ((plan?.posts?.length ?? 0) < days) return { key, year: y, month: m, done: plan?.posts?.length ?? 0, days };
  }
  return null;
}
