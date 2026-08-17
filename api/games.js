const Sentry = require('../lib/sentry');

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

// Folds IGDB's ~20 specific genres down into a short, curated list —
// showing every raw genre as its own filter chip would be exactly the kind
// of overwhelming choice this app is deliberately avoiding. Anything not
// explicitly mapped falls under "Other" rather than being dropped.
const GENRE_CATEGORY_MAP = {
  'shooter': 'Shooter',
  'fighting': 'Action',
  'hack and slash/beat \'em up': 'Action',
  'platform': 'Action',
  'arcade': 'Action',
  'adventure': 'Adventure',
  'point-and-click': 'Adventure',
  'visual novel': 'Adventure',
  'role-playing (rpg)': 'RPG',
  'strategy': 'Strategy',
  'real time strategy (rts)': 'Strategy',
  'turn-based strategy (tbs)': 'Strategy',
  'tactical': 'Strategy',
  'moba': 'Strategy',
  'sport': 'Sports & Racing',
  'racing': 'Sports & Racing',
  'simulator': 'Simulation & Puzzle',
  'puzzle': 'Simulation & Puzzle',
  'quiz/trivia': 'Simulation & Puzzle',
  'card & board game': 'Simulation & Puzzle',
  'pinball': 'Simulation & Puzzle',
  'music': 'Simulation & Puzzle',
};

function mapGenreCategory(rawGenre) {
  if (!rawGenre) return 'Other';
  return GENRE_CATEGORY_MAP[rawGenre.toLowerCase()] || 'Other';
}

function toCoverUrl(rawUrl) {
  if (!rawUrl) return null;
  // IGDB gives protocol-relative thumbnail URLs by default (e.g. //images.igdb.com/...t_thumb...).
  // Upgrade to a larger size and add the protocol. t_cover_big (~227x320) was
  // a low ceiling for the full-width hero image on the game detail screen,
  // especially on higher-density phone screens — t_1080p is IGDB's larger
  // template and applies to cover images too, not just screenshots. Trade-off
  // is more bandwidth per image load across every screen that renders a
  // cover (Calendar, Watchlist, Search, detail hero) — accepted deliberately,
  // not a bug fix (see fix log item 12).
  const upgraded = rawUrl.replace('t_thumb', 't_1080p');
  return upgraded.startsWith('//') ? `https:${upgraded}` : upgraded;
}

// A hard `.slice(0, DESC_LIMIT)` cuts mid-word/mid-sentence with no visual
// sign it happened — on the game detail screen, that truncated text used to
// run straight into a fixed marketing sentence with nothing but a single
// space between them, reading like the marketing sentence was "covering"
// the end of the description. Backing off to the last whitespace before the
// limit, and adding an ellipsis only when a real cut happened, fixes the
// backend half of that (see app/game/[title].js for the frontend half).
const DESC_LIMIT = 220;
function truncateSummary(summary) {
  if (!summary) return null;
  if (summary.length <= DESC_LIMIT) return summary;
  const slice = summary.slice(0, DESC_LIMIT);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
  return `${trimmed}…`;
}

module.exports = async function handler(req, res) {
  try {
    const token = await getAccessToken();
    const clientId = process.env.TWITCH_CLIENT_ID;

    const nowUnix = Math.floor(Date.now() / 1000);
    const oneYearOut = nowUnix + 60 * 60 * 24 * 365;

    // IGDB caps each request at 500 results. With no filter on release type
    // (DLC, mobile ports, and small indie titles all count equally toward
    // that cap), a full year's worth of releases can easily exceed 500
    // entries before reaching a late-in-the-window title like a big AAA
    // release announced for the fall. So: page through results instead of
    // taking just the first batch, up to a generous cap.
    const PAGE_SIZE = 500;
    // 4 pages (2000 games) turned out not to cover a full year — actual
    // release volume across ps/xbox/switch/pc is denser than that, so the
    // fetch was hitting this cap and silently cutting off mid-year instead
    // of reaching the full 12-month window the query below asks for. Raised
    // well above the real expected total so the loop's own early-exit below
    // (a page returning fewer than PAGE_SIZE results) is what actually stops
    // it, not this number. Vercel Pro's function duration (300s default,
    // extendable) comfortably covers even the worst case of paging all the
    // way to this cap.
    const MAX_PAGES = 20; // backstop only — up to 10,000 games
    let rawGames = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const query = `
        fields name, first_release_date, platforms.name, genres.name, summary, cover.url;
        where first_release_date > ${nowUnix} & first_release_date < ${oneYearOut} & platforms != null;
        sort first_release_date asc;
        limit ${PAGE_SIZE};
        offset ${offset};
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
        // If we already got some pages successfully, use what we have rather
        // than failing the whole request over one bad page.
        if (rawGames.length > 0) break;
        Sentry.captureException(new Error(`IGDB request failed (${igdbResponse.status}): ${detail}`));
        await Sentry.flush(2000);
        return res.status(502).json({ error: 'IGDB request failed', detail });
      }

      const pageGames = await igdbResponse.json();
      rawGames = rawGames.concat(pageGames);

      // Fewer results than a full page means we've reached the end — no need
      // to keep paging.
      if (pageGames.length < PAGE_SIZE) break;
    }

    const games = rawGames
      .map((g) => {
        // A record with no title (`g.name`) used to slip through here and
        // crash on an `undefined` title downstream — `app/search.js`'s
        // `g.title.toLowerCase()` filter and `lib/theme.js`'s
        // `hashStr(game.title)` (called by GameCard on every card) both
        // assume a real string. Not the cause of the real crash this project
        // hit (see fix log item 8), but a real, cheap gap worth closing.
        if (!g.name || !g.first_release_date || !g.platforms) return null;

        const platforms = [...new Set(g.platforms.map((p) => mapPlatform(p.name)).filter(Boolean))];
        if (platforms.length === 0) return null; // skip games on platforms we don't track

        const date = new Date(g.first_release_date * 1000);
        const genre = g.genres && g.genres.length > 0 ? g.genres[0].name : 'Adventure';
        const genreCategory = mapGenreCategory(genre);

        return {
          title: g.name,
          date: [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()],
          platforms,
          genre,
          genreCategory,
          desc: truncateSummary(g.summary),
          coverUrl: toCoverUrl(g.cover && g.cover.url),
        };
      })
      .filter(Boolean);

    // Cache at the edge for an hour — release dates don't change minute to minute,
    // no need to hit IGDB fresh on every single app open.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ games, count: games.length });
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return res.status(500).json({ error: err.message });
  }
};