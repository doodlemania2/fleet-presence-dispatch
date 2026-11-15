#!/usr/bin/env node
// Works out which features a push touched and which ones it shipped, for presence-dispatch.yml.
// Reads the caller repo through the GitHub API (no checkout needed), so any runner with Node 18+ works.
//
// env: REPO (owner/name), BEFORE, SHA, GH_TOKEN (read access to REPO), FEATURES_PATH (default presence/features.json)
// prints one JSON object: { features_touched: [...], features_shipped: [...], shipped_details: [...], has_features_file: bool }
// shipped_details carries name, summary and audiences, so receivers (TDPPublic socials) need no read token.

const { REPO, BEFORE, SHA, GH_TOKEN } = process.env;
const FEATURES_PATH = process.env.FEATURES_PATH || 'presence/features.json';
const api = 'https://api.github.com';
const headers = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

const ZERO = /^0+$/;

async function getJson(path) {
  const r = await fetch(api + path, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function featuresAt(ref) {
  if (!ref || ZERO.test(ref)) return null;
  const r = await fetch(`${api}/repos/${REPO}/contents/${FEATURES_PATH}?ref=${ref}`, {
    headers: { ...headers, Accept: 'application/vnd.github.raw+json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${FEATURES_PATH}@${ref}: HTTP ${r.status}`);
  return JSON.parse(await r.text());
}

async function changedFiles() {
  if (!BEFORE || ZERO.test(BEFORE)) return null; // new branch or first push: treat as "everything"
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const c = await getJson(`/repos/${REPO}/compare/${BEFORE}...${SHA}?per_page=100&page=${page}`);
    if (!c) return null;
    files.push(...(c.files || []).map((f) => f.filename));
    if ((c.files || []).length < 100) break;
  }
  return files;
}

// Minimal glob: ** = any path, * = any run of non-slash characters, ? = one non-slash character.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const after = await featuresAt(SHA);
const before = await featuresAt(BEFORE);
const files = await changedFiles();

const out = { has_features_file: Boolean(after), features_touched: [], features_shipped: [], shipped_details: [] };
if (after) {
  for (const f of after.features) {
    const res = f.sources.map(globToRegExp);
    if (files === null || files.some((p) => res.some((re) => re.test(p)))) out.features_touched.push(f.id);
  }
  const wasReady = new Set((before?.features || []).filter((f) => f.status === 'ready').map((f) => f.id));
  out.features_shipped = after.features.filter((f) => f.status === 'ready' && !wasReady.has(f.id)).map((f) => f.id);
  // First time the file appears: do not announce the whole back catalogue as "shipped".
  if (!before) out.features_shipped = [];
  out.shipped_details = after.features
    .filter((f) => out.features_shipped.includes(f.id))
    .map(({ id, name, summary, audiences }) => ({ id, name, summary, audiences }));
}
process.stdout.write(JSON.stringify(out));
