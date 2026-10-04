# Gaming Views — Backend

A tiny serverless backend with these endpoints:

* `/api/health` — returns `{ status: "ok" }`. No credentials needed. Use this to confirm deployment works before touching IGDB at all.
* `/api/games` — the real one. Authenticates with Twitch, queries IGDB, returns clean game data (title, date, platforms, genre, description, cover art URL) shaped to match what the Gaming Views app expects. `?when=steam-wishlist&steamid=<id>` is a Steam-specific mode of this same endpoint — see "Steam wishlist sync" below.
* `/api/steam-auth` — Steam OpenID login (`?mode=login`) and callback (`?mode=callback`). See "Steam wishlist sync" below.

## Steam wishlist sync

Lets a user link their Steam account (no backend user-account system — the app just remembers their SteamID64 locally) so new Steam wishlist items get auto-matched to this app's own game data and added to their Watchlist.

**No `STEAM_API_KEY` needed, on purpose.** Steam login (`/api/steam-auth`) verifies an OpenID 2.0 assertion by calling Steam's own `openid/login` endpoint with `check_authentication` — that's not the Steam Web API, it needs no key. The wishlist fetch (`/api/games?when=steam-wishlist`) reads an undocumented public JSON endpoint (`store.steampowered.com/wishlist/profiles/<id>/wishlistdata/`) that's also keyless. If something here ever looks like it's failing for lack of credentials, that's a different bug — don't register a Steam Web API key to "fix" it.

**Real, accepted risk:** Steam has never published or supported a wishlist API. This feature relies on an endpoint third-party Steam tools use but Valve could change or block at any time with no notice, and it only returns data when the user's Steam profile/wishlist privacy is set to public — a private profile returns "nothing to sync," which is expected, normal behavior, not an error to chase.

## Environment variables (set these in Vercel, never in code)

* `TWITCH\_CLIENT\_ID`
* `TWITCH\_CLIENT\_SECRET`

Get these from https://dev.twitch.tv/console — same process as before, but generate a **fresh** pair. Treat any credential that was ever pasted into a chat as burned.



## Deploying

1. Push this folder to its own new GitHub repo.
2. Go to vercel.com, sign in with GitHub.
3. "Add New Project" → import that repo.
4. Before deploying, add the two environment variables above under Project Settings → Environment Variables.
5. Deploy.
6. Visit `https://your-project.vercel.app/api/health` — should show `{"status":"ok",...}`.
7. Visit `https://your-project.vercel.app/api/games` — should show real, current game data.

If step 7 fails but step 6 works, the problem is IGDB/Twitch-specific (bad credentials, wrong env var names) rather than a deployment problem — check the error message the endpoint returns, it's designed to tell you what went wrong.

