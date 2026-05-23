# Roadmap

## Refine debug scoring rules

The current `调试分` in `scripts/run-debug-e2e.mjs` is only a smoke-test ranking signal. It proves the end-to-end pipeline can move from fetched raw source material to candidates, `digest.json`, Markdown, and HTML, but it is not yet a trustworthy news-importance score.

Future work:

- Split the single `score` into explainable components such as `keyword_score`, `source_score`, `freshness_score`, `specificity_score`, `novelty_score`, `noise_penalty`, and `final_score`.
- Penalize generic navigation or category labels such as `Developer tools`, `Daily Papers`, `Login`, `Subscribe`, and other non-story titles.
- Use historical high-value AI news as calibration examples: extract past AI milestones the user considered important, analyze their recurring keywords, source types, titles, and signal patterns, then use those patterns to improve candidate scoring.
- Keep this as a roadmap item for now; do not implement the calibration pass yet.
