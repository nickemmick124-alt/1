# Finance Friday

A weekly business-finance game for HR managers. Each round has five scenario decisions worth 20 points, a company brief, and explanations after submission. Rounds cover budgets, cash flow, operating profit, and financial statements.

The challenge changes every Monday at 00:00 UTC. Four authored themes rotate with adjusted financial figures and reordered choices. These are recurring learning exercises, not a continuously expanding question bank. A cycle of 160 weeks repeats the same monetary scaling; changing option ordering extends the full repeat period.

## Run locally

Requires Node.js 24+ (the local server uses `node:sqlite`).

```sh
npm ci
npm run dev
```

Open the printed local URL. Local sign-in uses a simulated owner identity and a local SQLite database; that simulation is never included in the production Worker. `LOCAL_OWNER_EMAIL` optionally changes the development owner email.

```sh
npm run db:generate
npm run build
npm test
```

## Hosted behavior

The build emits a Cloudflare-compatible module at `dist/server/index.js` with frontend assets embedded. The default export implements `fetch(request, env)`. It expects a Cloudflare D1 `DB` binding and the `OWNER_EMAIL` runtime value.

Production identity comes from the Sites dispatcher’s authenticated-user headers and its Sign in with ChatGPT route. Participants sign in before playing. Only the email matching `OWNER_EMAIL` can access team results and CSV downloads. Do not expose this Worker directly through a proxy that trusts user-supplied identity headers.

Scores are calculated on the server. A unique database constraint allows one scored submission per person per week and makes retries safe. Questions and explanations are stored with each submission so future edits preserve historical reviews. Browser session storage is used only for unfinished answer drafts; saved scores are held in D1.

Team results include weekly scores, question-level review, topic accuracy, and CSV export. No real participants or scores are seeded. The app does not send weekly emails or create scheduled messages. The owner can copy the same game URL each week.

For new weekly content, edit `src/challenges.json`, check the arithmetic, and build again. Monetary figures are scaled together; preserve that relationship when changing questions. All figures are fictional and all questions state the simplified accounting assumptions.

Production schema changes belong in `db/schema.ts`; generate migrations with Drizzle, inspect the SQL, and include them in the deployment. Applied migrations must remain immutable.
