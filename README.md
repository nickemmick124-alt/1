# CNH Finance Live

## CNH vs John Deere

The `/competitors` dashboard and current competitor quiz compare CNH with John Deere only. The October 2026 edition shows the latest CNH calendar Q2 and Deere fiscal Q3 with their actual quarter ends. Detailed cards show current figures, the same company's prior-year figures, calculated year-over-year changes, simple meanings and business relevance. Agriculture and Construction explain company-reported drivers separately from interpretation. Parent-attributable net income is used for both companies; equipment profit definitions and business-scope limits stay visible.

The live reference retains the detailed figures with expandable explanations. Legacy room snapshots without the new comparison data keep their original rendering and quiz content. The monthly refresh follows `COMPETITOR_REFRESH.md` and preserves Deere-only scope.

## North America HR leadership round

The primary hosting experience offers an eight-question leadership round alongside the existing beginner tracks. It uses the latest publicly reported quarter verified on October 10, 2026: Q2 2026, with matching Q2 2025 comparisons and clearly separated first-half cash figures. Participants can consult the financial fact sheet throughout the round. Questions test financial scope, reported versus adjusted earnings, margin changes, cash timing, segment performance, and evidence-based interpretation. One application exercise is explicitly fictional, with all calculation assumptions stated.

Leadership questions allow 90 seconds, followed by the existing host-controlled discussion pause. Correct answers retain the 500–1,000 point range; the speed component scales to the round's saved duration. The fact sheet and duration are captured in the room snapshot, so replay preserves the reference information used in the original round. Beginner and historical sessions retain their 40-second duration. Leadership rounds cannot be mixed with other tracks because their reference material differs.

The header uses the unmodified CNH corporate logo from the [official CNH homepage asset](https://www.cnh.com/-/media/CNHi/cnhicorporate/Home-Page/media/CNH_RGB-AREA_TransparentBackground.png?h=852&iar=0&w=1985&hash=4C6500D647C0DD0E083408818A54F690). The independent-training attribution remains visible.

The public `/facts` page is printable. It distinguishes consolidated revenue and net income from Industrial Activities measures. The stock price is a dated NYSE close in USD, not a live quote; refresh it deliberately before a later session. The cash-conversion definition is taken from CNH's public compensation disclosure and identified as such. No internal cash-conversion result, target, or approval standard is assumed. Source dates remain visible; there is no automatic financial-content refresh.

Leadership content and its reference snapshot live in `src/leadership.json`. When refreshing the quarter, verify the source measures, periods, units, comparisons, quote date, and derived answers together; version any question whose meaning changes. Keep saved rounds immutable.

## Beginner pilot

The beginner track starts with approachable material. Two eight-question rounds each build from three familiar work situations to three simple business concepts and two CNH applications. Each question has 40 seconds, followed by a host-controlled discussion pause. These teaching scenarios are labeled practice examples; they do not invent actual CNH or plant figures. Numerical examples explicitly state their simplified scope.

Answer reveals include a definition, where to look, a preparation exercise, and the closest CNH value. The public **Prepare** guide supports study before and after play without publishing quiz prompts, choices, or answer keys. A player's completed round lists concepts they missed or left unanswered, with targeted preparation pointers. All-correct players receive reinforcement practice. This personal review is visible only to the participant; the host's existing team results remain available. No guest login is required.

Start with Beginner 1 for the boss demonstration and team pilot, discuss each answer, then use Beginner 2 or replay to test understanding. A beginner review mix contains six current questions and two archived questions. Choose a beginner archive to keep the pilot accessible. Historical five-question sets, results, and replay remain supported; the primary hosting UI no longer exposes advanced level choices. The server retains explicit legacy week/level requests for compatibility. Default requests with no legacy week or level create Beginner 1. There is no automatic participant advancement or knowledge certification.


A live business-acumen quiz and public-source CNH finance reference for HR managers.

## Play live

The assessment owner or an approved host creates a room, shares its six-character code or link, and waits for players to join. Players enter the room code and a display name; **no ChatGPT account or sign-in is required to play**. A room link fills in the code. Hosts still sign in with ChatGPT. Leadership questions allow **90 seconds**; beginner and legacy questions allow **40 seconds**. Correct answers earn **500–1,000 points**, with faster correct answers scoring higher; wrong or late answers earn zero. The first accepted answer is final.

The host advances after each timer ends. The correct answer, explanation, and top three appear after the deadline. Final results are saved, and the host can review and export a CSV. Player display names and total scores appear on the leaderboard; email addresses and full exported results remain host-only.

Every answer reveal and saved-round discussion includes one closest CNH value and a short, practical connection. The five names use CNH's current public Our Company page, checked October 4, 2026: Built Around Customers, We Go Beyond, Make It Simple, Win As One, and You Matter. Connections are training interpretations, not official CNH assignments. Repeating the same value is fine; do not rotate values merely for variety. The production-readiness response also includes a value connection.

Keep this behavior in future updates. Each question should author `valueConnection: { valueId, why }` in `src/challenges.json`. The shared resolver uses the question's authored connection, then a topic default, then Make It Simple, so new questions always receive a connection. The policy and canonical names live in `src/business-context.json`; rendering and fallback logic live in `public/values.js`. Never send the connection before the answer reveal, because its reasoning may hint at the answer. New room snapshots capture the connection and values source; existing rooms without one receive a topic-based connection at review time without changing stored results.

The question library has four selectable curriculum weeks: CNH Q2 2026 results; commodities and the ag cycle; production and qualified skills; CBS, cost, and cash. Every week offers Foundations, Apply, and Stretch, giving 12 distinct saved-question sets and 60 questions. These week numbers describe the curriculum, not a calendar lock. All weeks and levels are available to approved hosts during beta testing. The weekly suggestion still rotates; creating another session does not automatically create new content. Answer positions vary between sessions, but published figures, periods, and explanations never scale. Operating-principle questions are explicitly labeled; they do not assert actual plant conditions. Sources and discussion prompts appear after reveal. The tool is independent training, not an official CNH product.

For the previous beta sets, explicit legacy requests still support five current questions or three current plus two review questions. Saved rounds can replay all original questions, including eight-question beginner sessions. Reuse reads the saved question snapshot, not today’s edited bank. Question wording, figures, periods, correct answer meaning, explanations, values connections, and source records are preserved; option positions may change. Review questions are identified after reveal. A same-set mix avoids asking an identical question twice within the session. The newest 100 rooms are listed; stored room snapshots and results are not deleted by content updates.

At the end of a mixed or replayed round, each participant and the host see review correct / review question count separately from the speed score. These counts include unanswered review questions as incorrect. Use the same participant group to investigate retention; the count itself does not establish that a newly joining player saw the original question. CSV exports include curriculum week, level, format, and review counts. Replaying creates a fresh room and leaves the original scores and snapshots unchanged.

The quarter decoder compares Q2 and H1 2026 with the same 2025 periods across Industrial Activities, Agriculture, Construction, and Financial Services. The Agriculture EBIT bridge uses the published Q2 figures. Business drivers show dated September USDA forecasts and link to contract-specific CME quotes. No quote feed or automatic content refresh is implied. CNH vocabulary includes public-source company terms and separately labeled general operating concepts.

Production readiness accepts five user inputs with no fabricated plant defaults. It screens good-unit capacity using the lowest gross stage capacity and first-pass yield; it does not model rework recovery, opening WIP, product mix, or ramp lead time. Inputs remain in memory in the browser and are not posted or saved.

## Host access

Sign in as the owner, open **Host access**, and add a person’s exact ChatGPT sign-in email plus an optional display label. They open the site and sign in with that account; an already open page needs a refresh to display the new controls. No invitation email is sent. The owner can copy the site link to share through their own channel. Matilda and other testers must be added using their actual account email; never infer or seed a real person’s email from their name.

The owner remains controlled by the existing `OWNER_EMAIL` runtime secret and cannot be removed through the app. Additional hosts are persisted in D1’s `host_access` table. All management endpoints are owner-only and require the normal authenticated, same-origin JSON request checks. Permission follows verified server identity, not a display name or client-side role field. Guests and ordinary signed-in visitors can join as players but cannot create sessions or manage host access. Approved hosts retain access to their own historical rooms until revoked; restoring access also restores access to those existing results. Hosting permissions are separate from the Site’s visitor audience, which is unchanged by a grant.

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

Signed-in account identity comes from Sites dispatcher authenticated-user headers and its Sign in with ChatGPT route. Sites audience settings determine who can visit; the existing public audience allows guests to play. The owner email controls Host access. The owner can grant and revoke hosting by the verified email a person uses to sign in with ChatGPT. Approved hosts can create rooms and see only their own saved rounds. Only the approved account that created a room can advance it, review its private results, replay it, or export it. Hosting access is rechecked for each privileged request; removing it immediately blocks those actions without deleting prior sessions or scores. Host access never grants owner rights to manage the host list. Do not expose this Worker through a proxy that accepts client-supplied identity headers.

Scores and deadlines are calculated server-side. Client-supplied scores and times are ignored. Duplicate submissions are protected by unique database constraints. Full question snapshots are saved with rooms, preserving historical results after future question edits. The leaderboard refreshes about once a second; timing points use arrival of the complete answer request at the server, so connection latency contributes to response time. Up to 100 participants may join a room; that capacity has not been load-tested.

Rooms and scores use D1, not browser storage. Guest participation uses a random 256-bit credential in a Secure, HttpOnly, host-only SameSite=Lax cookie, valid for 30 days. D1 stores only its SHA-256 hash, an internal guest ID, the last display name, and expiry. Guest credentials never grant hosting rights. Same-origin JSON checks also apply to guest joins and answers, and every room read or answer requires membership for that credential. Reloading in the same browser restores the same participant and locked answers, including after a round has started. Losing the cookie or changing browsers does not recover the old score; new players can only join before the host starts. Signing in afterward preserves access to an existing guest entry in that browser if the account does not already have its own entry in the room. Guest names are self-reported; host results and CSV exports label guests and leave their email blank. Do not imply that a guest name verifies a person or establishes participation in an earlier round. Expired guest credentials are cleaned up when another guest joins; saved players, answers, and room snapshots are retained. The application does not send invitations or weekly emails. Host a new room each week and distribute its link through your usual company channel.

Foundations are in `src/challenges.json`; Apply and Stretch sets are in `src/question-levels.json`; composition and replay logic are in `src/rounds.mjs`; public source observations and terminology are in `src/business-context.json`. New questions must fit the 40-second format, declare their evidence basis, and cite the appropriate dated public source for a factual claim. Keep `factual: true` so published data never scales. Source objects are captured in room snapshots, preserving explanations and citations in saved rounds. There is no automatic generation of questions or market-data refresh. Give each new question a stable versioned ID; change its version when meaning or the correct answer changes. Keep earlier sessions immutable so that replay stays faithful after content updates.

For a content refresh, update the dated observations and source check date, review the related questions and definitions, run the tests, and publish the exact source state. Never relabel a forecast as a current quote, treat industry sales as CNH sales, or substitute an Industrial Activities measure for consolidated or Financial Services results.

Schema changes belong in `db/live-schema.ts`. Generate and inspect Drizzle migrations before building. Applied migrations must stay immutable.
