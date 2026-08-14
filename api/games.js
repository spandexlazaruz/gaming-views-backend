// In-memory cache for the Twitch access token. Persists across "warm"
// invocations of this function on Vercel, so we're not re-authenticating
// on every single request.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET environment variables');
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
  const response = await fetch(url, { method: 'POST' });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twitch token request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Twitch response did not include an access token');
  }

  cachedToken = data.access_token;
  // Refresh a minute early so we never try to use a token right as it expires.
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// Maps IGDB's verbose platform names down to the 4 keys the app understands.
const PLATFORM_PATTERNS = [
  { pattern: 'playstation', key: 'ps' },
  { pattern: 'xbox', key: 'xbox' },
  { pattern: 'switch', key: 'switch' },
  { pattern: 'windows', key: 'pc' },
  { pattern: 'pc (microsoft', key: 'pc' },
];

function mapPlatform(name) {
  const lower = name.toLowerCase();
  for (const { pattern, key } of PLATFORM_PATTERNS) {
    if (lower.includes(pattern)) return key;
  }
  return null;
}

function toCoverUrl(rawUrl) {
  if (!rawUrl) return null;
  // IGDB gives protocol-relative thumbnail URLs by default (e.g. //images.igdb.com/...t_thumb...).
  // Upgrade to a larger size and add the protocol.
  const upgraded = rawUrl.replace('t_thumb', 't_cover_big');
  return upgraded.startsWith('//') ? `https:${upgraded}` : upgraded;
}

module.exports = async function handler(req, res) {
  try {
    const token = await getAccessToken();
    const clientId = process.env.TWITCH_CLIENT_ID;

    const nowUnix = Math.floor(Date.now() / 1000);
    const oneYearOut = nowUnix + 60 * 60 * 24 * 365;

    // IGDB's query language (Apicalypse) — plain text, not JSON.
    const query = `
      fields name, first_release_date, platforms.name, genres.name, summary, cover.url;
      where first_release_date > ${nowUnix} & first_release_date < ${oneYearOut} & platforms != null;
      sort first_release_date asc;
      limit 500;
    `;

    const igdbResponse = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: query,
    });

    if (!igdbResponse.ok) {
      const detail = await igdbResponse.text();
      return res.status(502).json({ error: 'IGDB request failed', detail });
    }

    const rawGames = await igdbResponse.json();

    const games = rawGames
      .map((g) => {
        if (!g.first_release_date || !g.platforms) return null;

        const platforms = [...new Set(g.platforms.map((p) => mapPlatform(p.name)).filter(Boolean))];
        if (platforms.length === 0) return null; // skip games on platforms we don't track

        const date = new Date(g.first_release_date * 1000);
        const genre = g.genres && g.genres.length > 0 ? g.genres[0].name : 'Adventure';

        return {
          title: g.name,
          date: [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()],
          platforms,
          genre,
          desc: g.summary ? g.summary.slice(0, 220) : null,
          coverUrl: toCoverUrl(g.cover && g.cover.url),
        };
      })
      .filter(Boolean);

    // Cache at the edge for an hour — release dates don't change minute to minute,
    // no need to hit IGDB fresh on every single app open.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ games, count: games.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};