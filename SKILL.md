---
name: news-collector
description: Generate a daily AI digest for 普太 with structured editorial judgment across model, agent, and workflow layers. Use when asked to collect recent AI news, produce an AI日报, save the report to a configured local output directory, or run the recurring 9:00 daily AI digest workflow.
---

# news-collector

Generate an AI日报 that behaves more like a research editor than a news scraper.

## Core analysis layers
1. **模型层（基座层）**
   - New models, capability jumps, benchmarks, pricing/deployment implications
   - This is the deepest layer because model capability propagates downstream
2. **Agent 层（应用能力层）**
   - Agent products, orchestration, tool use, async/multi-agent, computer use
   - Judge whether an update reflects real capability progress or mostly product packaging
3. **工作流 / 编程范式层**
   - New ways of coding, delegating, reviewing, and coordinating work with AI
   - Highlight durable workflow shifts, not just feature announcements

## Read before working
- Read `references/config.json` to get the output directory.
- Read `references/sources.md` for the source list.
- Read `references/evolve-target.md` when you need the stronger editorial bar and layered analysis intent.
- Use `const { fetchWithRetry } = require('skills/web-fetch-retry');` and prefer `fetchWithRetry(url, web_fetch)` for source fetching.

## Editorial standard
For important items, do not stop at summarizing facts. Prefer structured judgment:
- 它属于哪一层？（模型 / Agent / 工作流）
- 核心增量是什么？
- 与已有主流方案相比，强在哪 / 弱在哪？
- 影响路径是什么？会传导到哪些下游能力？
- 时间尺度是什么？短期显著、中期转折、还是长期基座变化？

Write these fields for quick human reading, not for a research abstract:
- `判断` should be 1-2 short sentences. Start with the plain-language meaning of the title: “这件事真正说明的是…”. Avoid piling up more than 3 abstract nouns in one sentence.
- `对比` should name one clear contrast only: “以前是 A，现在变成 B” or “它比 X 多/少了什么”. Do not compare against every adjacent product.
- `影响` should be a short cause-effect path: “所以谁会先受影响、会怎么变”. Prefer concrete users, teams, workflows, costs, risks, or tools.
- If a sentence needs multiple commas to stay alive, split it.
- Keep top-item detail fields useful but skimmable; important-item bullets may be even shorter.

## Novelty and follow-up rule
Before drafting, compare against the previous 2 reports in `outputDir` when available.
- If an item already appeared yesterday or the day before, do **not** repeat the same summary as a top item unless there is a concrete new information increment.
- For repeated stories, either:
  1. dig deeper and report only the new increment (`今日新增：...`), or
  2. omit it from today's report when there is no material update.
- Prefer fresh angles from primary sources, benchmark updates, API availability, pricing/deployment details, third-party evaluation, real user feedback, governance changes, or ecosystem reactions.
- A good daily report should answer: “What do I know today that I did not know yesterday?”

When a new model launches, try to explain:
- relative position vs incumbent models
- what it is actually better at
- whether the delta is large enough to matter downstream for agents or coding workflows

When an agent/tool update lands, explicitly judge whether it is:
- capability-driven
- workflow-driven
- or mostly packaging / product-layer reframing

## Workflow
1. Read the configured `outputDir` from `references/config.json`.
2. Gather high-signal items from the listed sources, prioritizing the last 7 days.
3. Rank quality over quantity; do not flatten all items to the same importance.
4. Classify each strong item into one primary layer:
   - `模型层`
   - `Agent层`
   - `工作流/范式层`
5. Draft the report as `## 📰 AI日报 — {日期}` with clear judgment, not just summaries.
6. Keep the report short: 2-3 top items and 3-5 important items. Omit lower-priority items instead of creating a third section.
7. Save the full report to `{outputDir}/{YYYY-MM-DD}.md` using `write`.
8. Generate the standalone HTML reading view at `{outputDir}/{YYYY-MM-DD}.html`.
9. Only after confirming the Markdown and HTML writes succeeded, return/output the report for delivery.
10. Start the final response with the generated HTML file path before the report title.
11. If saving or rendering fails, report the failure clearly and do not pretend delivery succeeded.

## Output format
```md
HTML 版：{outputDir}/{YYYY-MM-DD}.html

## 📰 AI日报 — {日期}

### 🔥 最高优先级（最值得关注）
- [来源] 标题
  层级：模型层 / Agent层 / 工作流层
  判断：用白话说明标题背后的真正增量，1-2 句
  对比：以前是什么，现在变成什么，或相对一个参照物差在哪
  影响：谁会先受影响，会怎么变

### 📚 重要动态
- [来源] 标题 | 简要说明 + 判断
```

## Notes
- Keep the final output to the HTML file path plus report body only.
- Do not paste raw HTML in the final response.
- Default to 2-3 items in `最高优先级` and 3-5 items in `重要动态`.
- Do not include a `追踪中` / tracking section in the normal daily report unless the user explicitly asks for tracking.
- If an item is uncertain, stale, repeated, or lower priority, usually omit it rather than preserving it in a tail section.
- Do not save reports inside the skill directory.
- The skill directory stores configuration only; reports belong in the configured output directory.
- Be willing to say an update is mostly packaging rather than substantive progress.
- When uncertain, downgrade an item rather than overstating it.
- Prioritize signal useful to AI engineers, coding workflows, and productivity shifts.

## HTML conversion
When asked to convert an existing Markdown report to a portable HTML file, use:

```bash
node scripts/convert-md-to-html.mjs "{path-to-report.md}"
```

For a directory of old reports, use:

```bash
node scripts/convert-md-to-html.mjs "{reports-dir}" --output "{html-output-dir}"
```

The generated HTML is a standalone file with inline CSS and no required external assets.
