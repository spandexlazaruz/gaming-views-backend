// UPDATED (real bug found during on-device testing, 2026-10-04): the
// original version of this file used
// store.steampowered.com/wishlist/profiles/<id>/wishlistdata/ - documented
// here at the time as "the only workable option," since no official
// endpoint was known to exist. Confirmed live against a real account with
// a real public wishlist (16 items, privacy settings double-checked and
// correctly Public) that this endpoint now unconditionally 302-redirects
// to the store homepage regardless of privacy - Steam has evidently moved
// wishlist loading off this path entirely. Confirmed by inspecting the
// real wishlist page's own Content-Security-Policy header: its allowed
// connect-src list includes api.steampowered.com and no longer includes
// the old store.steampowered.com/wishlist/... path's data-fetching
// behavior at all - the page itself now loads wishlist data from the
// official Web API below.
//
// IWishlistService/GetWishlist/v1 is the real, working replacement -
// confirmed live: returns real data (verified against that same 16-item
// account) with NO API key required, despite living under
// api.steampowered.com (the official Web API host, where most methods do
// require one) - a GET with just `steamid` is sufficient. Still
// undocumented/unofficial in the sense that Valve hasn't published it in
// their partner docs, and still only returns the real list when the
// account's wishlist privacy is public (see lib/steamOpenId.js's and this
// file's own comments elsewhere on why that's an accepted, expected
// condition, not a bug) - but at least it's the endpoint Steam's own
// current website actually uses, not a guess from third-party tooling.
function wishlistUrl(steamId) {
  return `https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=${encodeURIComponent(steamId)}`;
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

  // Real shape: { response: { items: [{ appid, priority, date_added }, ...] } }.
  // A private profile/invalid id, from observed testing, comes back as a
  // non-200 (caught above) rather than a 200 with an empty/different
  // shape - this defensive check still covers that possibility gracefully
  // without throwing if Valve's actual behavior differs from what was
  // observed.
  const items = data && data.response && data.response.items;
  if (!Array.isArray(items)) return [];

  return items.map((item) => String(item.appid)).filter((id) => /^\d+$/.test(id));
}

module.exports = { fetchSteamWishlist };
