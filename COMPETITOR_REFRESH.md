# Monthly CNH / John Deere edition

The owner authorized automatic publication of verified public updates. The linked
Sites automation runs on the first day of each month at 09:00 America/New_York.
The site remains public. Use public sources only.

`src/competitors.json` is the dated source of truth. Update its `factSheet`, then
run `node scripts/refresh-competitors.mjs` to regenerate the eight 25-second
questions from those same facts. Advance `setId` to a new edition/revision before
regenerating. Do not modify previous room snapshots, answers, or scores.

## Verification and update procedure

1. Compare CNH with John Deere only, per the owner's October 10 instruction.
   Do not add other peers to the dashboard, questions, source list or stock series.
   Use each company's latest published earnings release and annual report.
   Preserve the actual period, currency, business scope, employee definition,
   profit measure, and source URL. Annual headcounts do not become monthly counts.
   Never silently relabel segment operating profit as gross profit or CNH EBIT.
2. Verify CNH and Deere historical closes on the same dates.
   End on the last completed NYSE trading day available at refresh time. The
   target baselines are one week, one calendar month, and one calendar year before
   that end date; use the last common NYSE trading day on or before each target.
   Store all actual dates and source links. Check for splits and other capital
   changes. The current measure is price return excluding dividends; do not mix
   it with adjusted-close total-return series. If a split occurs, use a verified
   consistently split-adjusted price series and explain that basis.
3. Calculate gross margin only from a matching sales/COGS scope, or use an
   explicitly reported figure. Keep calculation inputs in the note. Preserve the
   distinction between CNH Industrial Activities and Deere Equipment Operations.
   Deere equipment COGS differs from consolidated COGS. Do not rank business
   quality from mixed scopes or compare parent profit with consolidated profit.
   Maintain `factSheet.comparison`: current/prior figures, simple meanings,
   why each measure matters, and explicitly company-reported segment drivers.
   Compute year-over-year growth from rounded reported values, and margin changes
   in percentage points. Keep period dates and profit definitions visible.
   Narrative interpretations must not masquerade as reported causes. Update the
   three highlights and stock interpretation whenever the underlying facts change.
4. Update the edition and verification date only after source verification.
   Sources may legitimately retain older financial or annual reporting periods.
   If required data is unavailable or contradictory, retain the previous edition
   with its original dates and report the refresh failure; do not guess or claim
   the old edition was freshly verified. No database migrations or internal data
   are needed for this recurring update.
5. Regenerate questions. Review numerical answers, source attribution, unique
   correct options, and short wording appropriate for 25 seconds. If a tie or a
   changed segment definition or changed directional trend makes a template unsuitable, revise that template
   with a clear sourced question before publishing.
6. Run `npm run build` followed by
   `node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs`.
   Check the reference and stock horizon controls in the browser when the
   environment supports it. Publish the tested source through Sites, preserving
   the site's current access policy. Never expose quiz answers in the public
   facts endpoint.

Saved rounds include their full fact-sheet snapshot, source periods, question
wording, correct answers, and duration. Replays keep that historical edition.
The standalone competitor dashboard shows the latest published edition.
