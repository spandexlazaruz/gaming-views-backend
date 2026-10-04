// Steam has no official, documented API for reading a user's wishlist. The
// only workable option is this undocumented endpoint, used by many
// third-party Steam tools but never published or supported by Valve - it
// could change shape or stop working at any time with no notice, and it
// only returns real data when the user's Steam profile/wishlist privacy is
// set to public. Treat both of those as expected, routine conditions to
// handle gracefully (see fetchSteamWishlist below), not edge cases to
// special-case defensively after the fact.
//
// No API key: this is a plain public JSON endpoint on the store site, not
// the Steam Web API - a STEAM_API_KEY would only matter for actual Web API
// calls (api.steampowered.com), which this feature never makes.
function wishlistUrl(steamId) {
  return `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`;
}

// Returns an array of Steam App ID strings, or an empty array when the
// profile/wishlist is private, doesn't exist, or the request otherwise
// fails - every one of those is "nothing to sync this time," never thrown
// as an error, since a private profile is a normal, common user choice,
// not a bug.
async function fetchSteamWishlist(steamId) {
  let response;
  try {
    response = await fetch(wishlistUrl(steamId));
  } catch {
    return [];
  }
  if (!response.ok) return [];

  let data;
  try {
    data = await response.json();
  } catch {
    return [];
  }

  // A private/empty wishlist comes back as `{ success: 2 }` (no per-item
  // data at all), which is a plain object, not an array - confirmed by
  // testing this function against that exact shape, which an earlier
  // version of this check (Array.isArray alone) let through as a
  // single-item result (`["success"]`). Every real wishlist key is a
  // numeric Steam App ID string, so filtering to numeric-only keys both
  // excludes "success" and is correct even in the (unobserved, but
  // cheap to guard against) case of a mixed response.
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];

  return Object.keys(data).filter((key) => /^\d+$/.test(key));
}

module.exports = { fetchSteamWishlist };
