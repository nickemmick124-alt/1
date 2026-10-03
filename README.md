# CNH Finance Live

A live business-acumen quiz for HR managers, using fictional agriculture and construction equipment scenarios relevant to CNH Industrial.

## Play live

The assessment owner hosts a room, shares its six-character code or link, and waits for players to join. Each of the five questions allows **10 seconds**. Correct answers earn **500–1,000 points**, with faster correct answers scoring higher; wrong or late answers earn zero. The first accepted answer is final.

The host advances after each timer ends. The correct answer, explanation, and top three appear after the deadline. Final results are saved, and the host can review and export a CSV. Player identities and total scores appear on the leaderboard; email addresses and full exported results remain host-only.

Two authored rounds cover inventory, working capital, dealer terms, cash conversion, capital expenditure, revenue, profit margins, aftermarket servicing, cyclicality, and factory utilization. Figures adjust weekly and options rotate. These are fictional training exercises, not statements about CNH performance or an official CNH product.

## Run locally

Requires Node.js 24+ for the local SQLite adapter.

```sh
npm ci
npm run dev
```

Open the printed URL. Local Sign in uses a simulated owner; `/signin-with-chatgpt?as=player1` (also player2/player3) simulates other players for development. This simulation is isolated to `scripts/dev.mjs` and is never included in production. Local data is saved under the ignored `.local/` directory.

```sh
npm run db:generate
npm run build
npm test
```

## Production

The build emits a Cloudflare-compatible module at `dist/server/index.js`, with embedded frontend assets and default `fetch(request, env)` handler. It expects the Cloudflare D1 binding `DB` and runtime secret `OWNER_EMAIL`. Sites owns the database and hosting resources.

Production identity comes from Sites dispatcher authenticated-user headers and its Sign in with ChatGPT route. Hosting permissions determine who can visit. Only the owner email may host rooms; only each room’s host may advance or export it. Do not expose this Worker through a proxy that accepts client-supplied identity headers.

Scores and deadlines are calculated server-side. Client-supplied scores and times are ignored. Duplicate submissions are protected by unique database constraints. Full question snapshots are saved with rooms, preserving historical results after future question edits. The leaderboard refreshes about once a second; timing points use arrival of the complete answer request at the server, so connection latency contributes to response time. Up to 100 participants may join a room; that capacity has not been load-tested.

Rooms and scores use D1, not browser storage. The application does not send invitations or weekly emails. Host a new room each week and distribute its link through your usual company channel.

Question content is in `src/challenges.json`. New questions should fit the 10-second format, include unambiguous assumptions, and preserve any arithmetic when monetary figures scale together. Two rounds are included; there is no automatic generation of new questions.

Schema changes belong in `db/live-schema.ts`. Generate and inspect Drizzle migrations before building. Applied migrations must stay immutable.
