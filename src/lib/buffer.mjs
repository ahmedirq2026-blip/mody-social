// Buffer GraphQL client (https://api.buffer.com), personal API key auth.
// Docs: https://developers.buffer.com/

const ENDPOINT = 'https://api.buffer.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function token() {
  const t = process.env.BUFFER_API_KEY;
  if (!t) throw new Error('Missing BUFFER_API_KEY. Run: npm run doctor');
  return t;
}

export async function gql(query, variables = {}, { retries = 3, throwOnError = true } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(20000, 1500 * 2 ** (attempt - 1)));
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') || 5) * 1000;
      await sleep(wait);
      lastErr = new Error('Buffer rate limited (429)');
      continue;
    }
    if (res.status >= 500) { lastErr = new Error(`Buffer ${res.status}`); continue; }

    const json = await res.json().catch(() => null);
    if (!json) { lastErr = new Error(`Buffer ${res.status}: unparseable response`); continue; }
    if (json.errors?.length) {
      const msg = json.errors.map(e => e.message).join('; ');
      if (throwOnError) throw new Error(`Buffer GraphQL: ${msg}`);
      return { data: json.data ?? null, errors: json.errors };
    }
    return { data: json.data, errors: null };
  }
  throw new Error(`Buffer request failed: ${lastErr?.message}`);
}

export async function getOrganizationId() {
  if (process.env.BUFFER_ORG_ID) return process.env.BUFFER_ORG_ID;
  const { data } = await gql(`query { account { organizations { id name } } }`);
  const orgs = data?.account?.organizations ?? [];
  if (!orgs.length) throw new Error('No Buffer organizations visible to this API key.');
  return orgs[0].id;
}

export async function getChannels(organizationId) {
  const { data } = await gql(
    `query GetChannels($input: ChannelsInput!) {
       channels(input: $input) { id name service isQueuePaused }
     }`,
    { input: { organizationId } }
  );
  return data?.channels ?? [];
}

/**
 * Scheduled (not yet sent) posts, grouped by channel id.
 * The exact field naming for a post's channel is probed once and cached,
 * so a schema difference degrades into a retry rather than a crash.
 */
let postShape = null;
export async function getScheduledByChannel(organizationId) {
  const variants = [
    { name: 'channel', fields: 'id dueAt channel { id }', read: n => n.channel?.id },
    { name: 'channelId', fields: 'id dueAt channelId', read: n => n.channelId },
    { name: 'channels', fields: 'id dueAt channels { id }', read: n => n.channels?.[0]?.id }
  ];
  const ordered = postShape ? [variants.find(v => v.name === postShape), ...variants.filter(v => v.name !== postShape)] : variants;

  for (const v of ordered) {
    const q = `query GetScheduled($input: PostsInput!, $first: Int, $after: String) {
        posts(input: $input, first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { ${v.fields} } }
        }
      }`;

    const counts = new Map();
    const seen = [];
    let after = null;
    let failed = false;

    // page until Buffer says there is nothing left, so the cap check is honest
    for (let page = 0; page < 20; page++) {
      const { data, errors } = await gql(q, {
        input: { organizationId, filter: { status: ['scheduled'] }, sort: [{ field: 'dueAt', direction: 'asc' }] },
        first: 100,
        after
      }, { throwOnError: false });

      if (errors) { failed = true; break; }
      for (const edge of data?.posts?.edges ?? []) {
        const cid = v.read(edge.node);
        if (!cid) continue;
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
        seen.push({ id: edge.node.id, channelId: cid, dueAt: edge.node.dueAt });
      }
      const info = data?.posts?.pageInfo;
      if (!info?.hasNextPage) break;
      after = info.endCursor;
    }
    if (failed) continue;

    postShape = v.name;
    return { counts, posts: seen };
  }
  throw new Error('Could not read scheduled posts from Buffer (schema mismatch). Run: npm run doctor');
}

export async function createPost({ channelId, text, url, dueAt, metadata, isReel = false, thumbnailUrl }) {
  const asset = isReel
    ? { video: { url, ...(thumbnailUrl ? { thumbnailUrl } : {}) } }
    : { image: { url } };

  const { data } = await gql(
    `mutation CreatePost($input: CreatePostInput!) {
       createPost(input: $input) {
         ... on PostActionSuccess { post { id dueAt } }
         ... on MutationError { message }
       }
     }`,
    {
      input: {
        text,
        channelId,
        schedulingType: 'automatic',
        mode: 'customScheduled',
        dueAt,
        assets: [asset],
        ...(metadata ? { metadata } : {})
      }
    }
  );
  const result = data?.createPost;
  if (result?.message) throw new Error(`Buffer rejected the post: ${result.message}`);
  if (!result?.post?.id) throw new Error(`Unexpected createPost response: ${JSON.stringify(result).slice(0, 300)}`);
  return result.post;
}

/** Back-compat wrapper for the image-only callers. */
export const createImagePost = ({ imageUrl, ...rest }) => createPost({ ...rest, url: imageUrl });

export const SERVICE_ALIASES = {
  facebook: ['facebook', 'facebookpage', 'facebook_page'],
  instagram: ['instagram', 'instagram_business'],
  google: ['googlebusinessprofile', 'google_business_profile', 'googlebusiness', 'gmb', 'google']
};

export function classifyChannel(service = '') {
  const s = String(service).toLowerCase().replace(/[^a-z]/g, '');
  for (const [key, aliases] of Object.entries(SERVICE_ALIASES)) {
    if (aliases.some(a => s === a.replace(/[^a-z]/g, '') || s.includes(a.replace(/[^a-z]/g, '')))) return key;
  }
  return 'other';
}
