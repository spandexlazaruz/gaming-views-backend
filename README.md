# Gaming Views — Backend

A tiny serverless backend with two endpoints:

* `/api/health` — returns `{ status: "ok" }`. No credentials needed. Use this to confirm deployment works before touching IGDB at all.
* `/api/games` — the real one. Authenticates with Twitch, queries IGDB, returns clean game data (title, date, platforms, genre, description, cover art URL) shaped to match what the Gaming Views app expects.

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

