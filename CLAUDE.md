# The Temples · សាងប្រាសាទ — rules for every prompt

1. Read `docs/GAME_SPEC.md` and `docs/ARCHITECTURE.md` before work.
2. If the spec is unclear or conflicts, stop and report; never guess.
3. No new dependency without one line of reason in the summary.
4. Gift and game rules only in `config/*.json`, never hard-coded.
5. Every feature ships with its tests in the same prompt.
6. Finish only when `npm run verify` passes; report what was run and the results.
7. Keep 1080x1920 (the Kingdom tab is 1920x1080, 16:9, D51) and the performance budget (Low preset = stream target: laptop i5-1135G7, 8 GB RAM, GTX 1660 Super eGPU).

Check results are logged in `docs/CHECKS.md`.
