# Gaming Views backend — context for Claude Code

Vercel serverless functions backing the Gaming Views app — IGDB/Twitch API integration, one main endpoint (`api/games.js`) that the frontend queries for the full release dataset. This repo is the **backend**; the companion **app** repo (Expo/React Native) lives in the sibling folder `../gaming-views-app`. Don't mix the two up.

The fuller project history — roadmap, fix log, launch checklists, past decisions — lives in a separate claude.ai Project ("Gaming Views App") that this Claude Code session doesn't have access to. If something here looks incomplete, ask Dan rather than guessing from git history alone.

## Current state (as of 2026-09-08 — verify before trusting)

- iOS: submitted to Apple, "Waiting for Review." Android: approved, held back pending a simultaneous dual-store launch with iOS.
- This repo auto-deploys to Vercel on push to `main` — no manual deploy step, but env var changes need a *fresh* deploy to actually take effect (editing one after a deployment already ran doesn't retroactively apply).

## The one habit that matters most: verify, don't trust

Don't assume prior chat history or code comments reflect the real current state of this repo — check `git status`/`git diff`/`git log` yourself before building on top of anything or telling Dan something is done. This project has had real cases of "delivered" work that turned out to still be uncommitted.

## Practical notes

- IGDB's schema has real rough edges (deprecated fields, e.g. `external_games.category`) — confirm assumptions against a live query rather than documentation alone when something looks off.
- Any change here that the frontend depends on (new/renamed fields on the games response) needs the frontend repo updated in the same pass, not as an afterthought — check `../gaming-views-app` for consumers of the field you're touching.
