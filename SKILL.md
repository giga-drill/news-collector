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

## Novelty and follow-up rule
Before drafting, compare against the previous 2 reports in `outputDir` when available.
- If an item already appeared yesterday or the day before, do **not** repeat the same summary as a top item unless there is a concrete new information increment.
- For repeated stories, either:
  1. dig deeper and report only the new increment (`今日新增：...`), or
  2. demote it to `追踪中` with a clear note that there is no material update.
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
6. Save the full report to `{outputDir}/{YYYY-MM-DD}.md` using `write`.
7. Only after confirming the file write succeeded, return/output the report for delivery.
8. If saving fails, report the save failure clearly and do not pretend delivery succeeded.

## Output format
```md
## 📰 AI日报 — {日期}

### 🔥 最高优先级（最值得关注）
- [来源] 标题
  层级：模型层 / Agent层 / 工作流层
  判断：这件事为什么重要
  对比：相对已有方案强在哪 / 弱在哪
  影响：会影响哪些下游能力或工作流

### 📚 重要动态
- [来源] 标题 | 简要说明 + 判断

### ⏭️ 追踪中
- 哪些趋势值得继续观察，为什么暂时不下结论
```

## Notes
- Keep the final output to the report body only.
- Do not save reports inside the skill directory.
- The skill directory stores configuration only; reports belong in the configured output directory.
- Be willing to say an update is mostly packaging rather than substantive progress.
- When uncertain, downgrade an item rather than overstating it.
- Prioritize signal useful to AI engineers, coding workflows, and productivity shifts.
