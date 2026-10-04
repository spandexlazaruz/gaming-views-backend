// ADDED (Steam wishlist auto-sync — "show every wishlisted game, not just
// the ones IGDB has in its upcoming window, with a price where Steam has
// one"): store.steampowered.com/api/appdetails is a separate, public,
// keyless Steam Store endpoint (distinct from both the Web API wishlist
// endpoint in steamWishlist.js and IGDB) - confirmed live, no auth needed,
// just an App ID. Used two ways from api/games.js:
//   1. Pricing (price_overview) attached to a game IGDB already matched,
//      via extractSteamPrice.
//   2. A full fallback game object (buildLightweightGameFromSteam) for a
//      wishlisted title IGDB has no record for at all, or whose IGDB
//      record is outside this app's normal data (no parseable release
//      date) - built straight from Steam's own name/release_date/
//      header_image instead of being silently dropped.
// Same best-effort posture as fetchSteamWishlist: any failure (network,
// non-200, malformed JSON, a genuinely unlisted/delisted App ID) returns
// null, never throws - one bad id should never fail the whole sync.
async function fetchSteamAppDetails(appId) {
  let response;
  try {
    response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=us&l=en`);
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  // Real shape: { "<appid>": { success: true, data: {...} } }. A delisted
  // or region-restricted app comes back with success: false and no `data`.
  const entry = data && data[String(appId)];
  if (!entry || !entry.success || !entry.data) return null;
  return entry.data;
}

// Mirrors the shape components/GameCard.js and app/game/[title].js already
// render (`game.steam.price`/`discountPrice`/`discountPct`) - written
// against `lib/games.js`'s existing sample data for that shape, which
// predates any real data source for it. `is_free` games and anything with
// no price_overview at all (not yet priced, delisted) return null, same as
// "no Steam price to show" reads today.
function extractSteamPrice(appDetailsData) {
  if (!appDetailsData || appDetailsData.is_free || !appDetailsData.price_overview) return null;
  const p = appDetailsData.price_overview;
  const result = { price: p.initial / 100 };
  if (p.discount_percent > 0) {
    result.discountPrice = p.final / 100;
    result.discountPct = p.discount_percent;
  }
  return result;
}

const MONTH_ABBREVIATIONS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Steam's release_date.date is free text, not a structured timestamp like
// IGDB's - confirmed shapes seen live: "30 Sep, 2027" (day+month+year, the
// common already-dated case), "Sep 2027" (month+year, no day - defaults to
// the 1st), "Q4 2027" (parks on that quarter's first month), a bare "2027"
// (parks on Dec 31 as a loose placeholder - better than inventing a month),
// and free-form non-dates ("Coming soon", "To be announced", ""). Returns
// null for anything unparseable - this app has nowhere to render a game
// with no date at all (every screen's sort/countdown logic assumes one),
// so a null here means the title gets skipped, same as any other unmatched
// wishlist item, not that the whole response fails.
function parseSteamReleaseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();

  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})[,]?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_ABBREVIATIONS[m[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) return [Number(m[3]), month, Number(m[1])];
  }

  m = s.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const month = MONTH_ABBREVIATIONS[m[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) return [Number(m[2]), month, 1];
  }

  m = s.match(/^Q([1-4])\s+(\d{4})$/i);
  if (m) return [Number(m[2]), (Number(m[1]) - 1) * 3, 1];

  m = s.match(/^(\d{4})$/);
  if (m) return [Number(m[1]), 11, 31];

  return null;
}

// Steam's own genre vocabulary ("Action", "RPG", "Indie", ...) is a
// different set of strings than IGDB's (api/games.js's GENRE_CATEGORY_MAP
// expects IGDB's naming, e.g. "role-playing (rpg)") - a separate, smaller
// map rather than forcing Steam's strings through the IGDB one, which
// would silently fall back to "Other" for almost everything.
const STEAM_GENRE_CATEGORY_MAP = {
  'action': 'Action',
  'adventure': 'Adventure',
  'rpg': 'RPG',
  'strategy': 'Strategy',
  'simulation': 'Simulation & Puzzle',
  'casual': 'Simulation & Puzzle',
  'sports': 'Sports & Racing',
  'racing': 'Sports & Racing',
};
function mapSteamGenreCategory(rawGenre) {
  if (!rawGenre) return 'Other';
  return STEAM_GENRE_CATEGORY_MAP[rawGenre.toLowerCase()] || 'Other';
}

// Fallback game object for a wishlisted App ID with no IGDB match - same
// field shape as api/games.js's mapIgdbGame, built from Steam's own data
// instead. Steam-only, so `platforms` is always just ['pc'] - this app has
// no way to know a game is coming to PS/Xbox/Switch without IGDB's own
// cross-platform data. `storeLinks.pc` points straight at the real Steam
// store page, which IGDB's own external_games often lacks pre-release.
function buildLightweightGameFromSteam(appId, appDetailsData) {
  if (!appDetailsData || !appDetailsData.name) return null;
  const date = parseSteamReleaseDate(appDetailsData.release_date && appDetailsData.release_date.date);
  if (!date) return null;

  const genre = appDetailsData.genres && appDetailsData.genres.length > 0
    ? appDetailsData.genres[0].description
    : null;

  return {
    title: appDetailsData.name,
    date,
    platforms: ['pc'],
    platformDates: null,
    earlyAccessDates: null,
    genre: genre || 'Adventure',
    genreCategory: mapSteamGenreCategory(genre),
    desc: appDetailsData.short_description || '',
    coverUrl: appDetailsData.header_image || null,
    coverHeroUrl: appDetailsData.header_image || null,
    storeLinks: { pc: `https://store.steampowered.com/app/${appId}` },
    xboxGamePass: false,
    screenshots: (appDetailsData.screenshots || []).map((s) => s.path_full).filter(Boolean),
    videoId: null,
    hypes: 0,
  };
}

module.exports = { fetchSteamAppDetails, extractSteamPrice, parseSteamReleaseDate, buildLightweightGameFromSteam };
