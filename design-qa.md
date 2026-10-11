# CNH Finance Live — option 2 design QA

final result: passed

## Reference and evidence

The user selected option 2: a dark industrial game-show direction. The selected image is `/workspace/generated_images/exec-8d7b216a-739e-44bc-9a90-39d8ad2d405e.png` at 1586 × 992. The implementation preserves its navy manufacturing backdrop, yellow display accents, white entry panel, oversized timer and metallic podium.

Rendered evidence is available in the execution workspace:

- `/workspace/scratch/arena-home-desktop.png`: 1586 × 992, matching the reference viewport.
- `/workspace/scratch/arena-home-mobile.png`: 390 × 844.
- `/workspace/scratch/arena-home-tablet.png`: 768 × 1024.
- `/workspace/scratch/arena-comparison-full.png`: reference left, implementation right; both at the same desktop dimensions and deviceScaleFactor 1. No density normalization is needed.
- `/workspace/scratch/arena-comparison-form.png`: focused control comparison, crops resized to the same comparison dimensions.
- `/workspace/scratch/arena-home-host.png`, `arena-lobby.png`, `arena-question-desktop.png`, `arena-question-mobile.png`, `arena-reveal.png`, `arena-podium-desktop.png`, and `arena-podium-mobile.png`: real application states.
- `/workspace/scratch/arena-final-podium-detail.png`: final podium after rank-spacing correction.

## Visual assessment

The desktop composition, panel proportions, large heading, backdrop, timer and podium follow the chosen direction. The application uses self-hosted Barlow 700/800 for display text and Inter 400–800 for readable controls and content. Font licenses and the Phosphor icon license are included. Generated artwork is shipped as compact WebP assets; official Phosphor SVGs supply interface icons. No runtime external font or image request is required.

The join panel stays prominent. On phones it precedes the decorative heading and artwork, with readable labels and no horizontal overflow. Host controls and supporting pages retain the latest content and navigation. Reference sheets remain light for reading. Question answers use four distinct colors with icons and readable text. The timer, three-player rankings and final podium carry the same visual direction. Reduced-motion preferences are respected.

Input placeholders use #607380 (4.79:1 against white) and borders use #7c8f9c (3.26:1 against white). Button text, answer choices, navigation and results were checked visually across captured states. There are no remaining actionable P0, P1 or P2 findings. An independent reviewer confirmed that the updated form and final podium have no release-blocking visual issues.

## Corrections verified

1. Fixed mobile overflow, joined headline words, entry ordering and decorative artwork transparency. Aligned the desktop join panel with the selected composition.
2. Increased placeholder and input-border contrast, then captured the final form again.
3. Changed the body styling attribute from `data-view` to `data-surface` after detecting a collision with the click router. A full game subsequently passed through the real controls.
4. Corrected podium rank spacing to prevent number/name overlap and preserved answer colors on hover. The final podium was recaptured.

Minor reference differences are intentional: the latest configurable question durations (25 seconds for leadership/competitor tracks and 40 seconds for beginner) remain intact rather than copying the decorative mockup's 20. Current CNH-versus-John-Deere content and navigation remain intact. Dynamic application scores replace decorative mock scores. The diagonal red accent and exact mockup CTA alignment are minor visual differences that do not affect the flow.

## Functional verification

`npm test` passed all three existing suites: competitors, leadership and live. `node --check public/live-app.js` passed.

Local Chromium verification exercised the real UI with an owner and three independent guest browser sessions. It covered room creation, track selection, joining, starting questions, correct and wrong submissions, answer locking, reference access, top-three reveal, all eight questions, final podium, CSV-export link and navigation to financial facts and the CNH-versus-John-Deere dashboard. The first question used the real 25-second countdown; subsequent questions advanced time using only the isolated local database to finish the flow efficiently. This did not modify production data. No page console errors occurred. Desktop, mobile and tablet home pages, plus mobile question and results pages, had no horizontal overflow.

The portable Sites runtime and local headless Chromium were used because this environment did not expose the shared browser tool. This report does not claim a shared cloud-browser handoff or production browser test.

The refresh leaves backend authorization, scoring, database schema and existing migrations unchanged. It incorporates the latest Site source updates before publication.
