# news-collector

`news-collector` is a Codex skill for producing a judgment-oriented AI daily briefing. It is designed for readers who care less about seeing every AI headline and more about understanding which model, agent, and workflow changes actually matter.

The skill currently focuses on Chinese AI reports for an AI engineer / workflow-oriented reader, but the long-term shape is a personalizable briefing engine: sources, ranking rules, editorial rubric, style examples, and output surfaces can be adapted for different readers.

## What It Produces

The final briefing is structured around editorial judgment, not a flat news list:

- **最高优先级**: the few items most worth attention today.
- **重要动态**: meaningful updates that should stay on the radar.
- **追踪中**: uncertain, incomplete, repeated, or still-developing signals.

For important items, the skill prefers these fields:

- `层级`: model layer, agent layer, or workflow/paradigm layer.
- `今日新增`: what is new today, not a repeated summary.
- `判断`: why the item matters and how strong the evidence is.
- `对比`: how it differs from existing approaches or adjacent products.
- `影响`: where the change may propagate downstream.

## Product Shape

For maximum spread, the skill should not be exposed only as a local skill. The skill is the production engine; the shareable surfaces should be:

1. **A public HTML briefing page**  
   One readable page per day, easy to open, share, and archive.

2. **Share cards**  
   Three to five visual cards for the highest-signal items, suitable for social feeds, chat groups, or newsletters.

3. **Newsletter / RSS / chat delivery**  
   A retention layer for people who already like the briefing.

4. **Personal briefing profiles**  
   Reader presets such as AI engineer, founder, PM, researcher, investor, or agent/coding-workflow specialist.

5. **The Codex skill / repo**  
   The customizable engine for advanced users who want to inspect raw evidence, change sources, adjust prompts, or run the pipeline locally.

In short: public pages and cards are the传播单位; the skill is the engine.

## Repository Layout

```text
.
├── SKILL.md                         # Codex skill instructions
├── README.md                        # Project overview
├── ROADMAP.md                       # Known next steps
├── references/
│   ├── config.json                  # Output directory config
│   ├── evolve-target.md             # Editorial direction
│   ├── sources.md                   # Source list
│   └── prompts/
│       └── backend-editor.md        # Editor-stage prompt
└── scripts/
    ├── run-real-e2e.mjs             # Real fetch -> raw files -> candidates -> debug digest
    ├── run-debug-e2e.mjs            # Small smoke/debug pipeline
    ├── prepare-editor-pass.mjs      # Build editor input from a run directory
    └── render-digest-html.mjs       # Render digest JSON/Markdown to standalone HTML
```

## Current Pipeline

The inspectable pipeline is split into four conceptual stages:

1. **Fetch information**  
   Read sources from `references/sources.md`, fetch source pages and article pages, and persist raw responses plus metadata.

2. **Score and prepare candidates**  
   Extract title, description, paragraphs, headings, raw paths, source metadata, keyword signals, and debug scores into JSONL files.

3. **Edit into a structured digest**  
   Use `references/prompts/backend-editor.md` and the persisted candidate evidence to produce a high-quality `digest.json`.

4. **Render**  
   Render `digest.json` or Markdown into a standalone HTML file with inline CSS.

The key design principle is that crawler scores are only recall/debug signals. Final ranking and prose quality should come from the editor stage.

## Running A Real Debug Pass

From the repo root:

```bash
node scripts/run-real-e2e.mjs --limit 20
```

This writes a timestamped run under the configured `outputDir`, currently set in `references/config.json`.

Typical run artifacts:

```text
debug-runs/<run-id>/
├── raw/
│   ├── sources/                     # Raw source page bodies and metadata
│   └── articles/                    # Raw article page bodies and metadata
├── state/
│   ├── sources.jsonl
│   ├── source-items.jsonl
│   ├── article-fetches.jsonl
│   ├── candidates.jsonl
│   ├── digest.json                  # Code-generated debug digest
│   ├── editor-input.json            # Compacted input for the editor stage
│   └── editor-prompt.md             # Prompt + input bundle
├── digest.md
└── digest.html
```

## Preparing The Editor Pass

After a real run:

```bash
node scripts/prepare-editor-pass.mjs "/path/to/debug-runs/<run-id>"
```

This produces:

- `state/editor-input.json`
- `state/editor-prompt.md`

The intended next step is to pass `editor-prompt.md` to an LLM/editor stage and save the result as a structured `digest.json`.

## Rendering HTML

Render any digest JSON or Markdown file to standalone HTML:

```bash
node scripts/render-digest-html.mjs "/path/to/digest.json" "/path/to/digest.html"
```

The generated HTML is self-contained: CSS is inline and no external assets are required.

## Customization Model

The project should balance a standard product with personal customization:

- **Fixed product contract**: fetch, persist raw evidence, deduplicate, prepare candidates, produce structured judgment, and render shareable outputs.
- **Profile-level customization**: reader role, focus areas, source bias, output length, language, and delivery channel.
- **Advanced customization**: source list, editorial rubric, prompt, scoring rules, style examples, and HTML layout.

Example future profile:

```yaml
profile:
  reader: ai_engineer
  focus:
    - agent
    - coding_workflow
    - ai_infra
  judgment_style: technical_increment
  output_length: standard
  source_bias:
    primary_sources: high
    newsletters: medium
    press_releases: low
```

## Roadmap

See `ROADMAP.md`. The main near-term work is improving candidate recall and scoring, especially for high-value research items that current source extraction can miss.
