# news-collector

`news-collector` is a Codex skill for producing a judgment-oriented AI daily briefing. It helps you answer:

- 今天 AI 领域真正值得关注的变化是什么？
- 哪些只是 PR、合作、包装或重复新闻？
- 模型、agent、开发工具和工作流之间的变化会怎么传导？
- 如果我只想花几分钟看 AI 新闻，应该先看哪几件事？

The skill currently focuses on Chinese AI reports for an AI engineer / workflow-oriented reader. It is not meant to be a generic AI news scraper; it behaves more like a research editor that reads many sources, filters noise, and writes a compact briefing with evidence, comparison, and judgment.

## Quick Use

Once this repo is installed as a Codex skill, ask Codex something like:

```text
用 news-collector 生成今天的 AI 日报。
```

or:

```text
跑一下今天的 AI 新闻简报，重点看模型、agent、coding workflow，有不确定的新闻放到追踪中。
```

The skill will:

1. Read the configured output directory from `references/config.json`.
2. Collect recent AI items from `references/sources.md`.
3. Prefer high-signal primary sources, research, developer tools, and ecosystem reactions.
4. Compare against recent reports when available, so repeated stories are not promoted without a real new increment.
5. Write the final report to the configured output directory.

Current default output directory:

```text
/Users/mac/AI progresses
```

## Example Output

The report is intentionally structured around judgment, not a flat list of links:

```md
## 📰 AI日报 — 2026-05-22

### 🔥 最高优先级（最值得关注）
- [Google AI Blog] Google I/O 2026 把 Gemini 3.5 Flash、Antigravity、Managed Agents 串成 agent 平台路线
  层级：模型层 / Agent层
  今日新增：Google 不只是发布更快的 Gemini 3.5 Flash，而是把模型、桌面 agent 应用、Gemini API 托管 agent 放在同一条开发者路线里。
  判断：这件事重要的地方在于，Google 正在把模型能力的叙事从“回答质量”推到“可执行工作流”。
  对比：相比过去 Gemini 主要作为模型/API 能力展示，这次更接近 OpenAI/Codex、Cursor、Claude Code 那条路线。
  影响：短期影响会落在开发者工具和企业自动化；中期会影响 agent runtime 和托管执行层。

### 📚 重要动态
- [JetBrains AI Blog] AI 代码错误不应都流入人工 review，IDE 应先拦一层

### ⏭️ 追踪中
- DeepWeb-Bench / AutoRPA 仍需要更稳定的 research-source recall。
```

## Running The Inspectable Pipeline

The skill can also run an inspectable end-to-end pipeline for debugging. This is useful when you want to see raw fetched pages, intermediate candidates, score breakdowns, editor input, Markdown, and HTML.

From the repo root:

```bash
node scripts/run-real-e2e.mjs --limit 20
```

This writes a timestamped run under the configured `outputDir`.

Prepare the editor input for an LLM/editor pass:

```bash
node scripts/prepare-editor-pass.mjs "/path/to/debug-runs/<run-id>"
```

Render any digest JSON or Markdown file to standalone HTML:

```bash
node scripts/render-digest-html.mjs "/path/to/digest.json" "/path/to/digest.html"
```

Convert an existing Markdown report to standalone HTML:

```bash
node scripts/convert-md-to-html.mjs "/Users/mac/AI progresses/2026-05-22.md"
```

Convert a folder of old Markdown reports:

```bash
node scripts/convert-md-to-html.mjs "/Users/mac/AI progresses" --output "/Users/mac/AI progresses/html"
```

The generated HTML is self-contained: CSS is inline and no external assets are required.

## What It Produces

The final briefing uses these sections:

- **最高优先级**: the few items most worth attention today.
- **重要动态**: meaningful updates that should stay on the radar.
- **追踪中**: uncertain, incomplete, repeated, or still-developing signals.

For important items, the skill prefers these fields:

- `层级`: model layer, agent layer, or workflow/paradigm layer.
- `今日新增`: what is new today, not a repeated summary.
- `判断`: why the item matters and how strong the evidence is.
- `对比`: how it differs from existing approaches or adjacent products.
- `影响`: where the change may propagate downstream.

## Why This Shape

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
    ├── convert-md-to-html.mjs       # Convert old Markdown reports to standalone HTML
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

## Real Debug Pass Artifacts

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

The intended next step after `prepare-editor-pass.mjs` is to pass `state/editor-prompt.md` to an LLM/editor stage and save the result as a structured `digest.json`.

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
