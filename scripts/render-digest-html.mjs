#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [, , inputPath, outputPathArg] = process.argv;

if (!inputPath) {
  console.error("Usage: node scripts/render-digest-html.mjs <input.md|digest.json> [output.html]");
  process.exit(1);
}

const outputPath =
  outputPathArg || join(dirname(inputPath), basename(inputPath).replace(/\.(md|json)$/i, ".html"));
const inputText = readFileSync(inputPath, "utf8").replace(/\r\n/g, "\n");
const digest = inputPath.toLowerCase().endsWith(".json")
  ? normalizeDigest(JSON.parse(inputText))
  : markdownToDigest(inputText);

writeFileSync(outputPath, renderPage({ digest, sourceFile: basename(inputPath) }));
console.log(outputPath);

function markdownToDigest(markdown) {
  return {
    title: extractTitle(markdown),
    sections: parseSections(markdown),
  };
}

function normalizeDigest(raw) {
  const title = raw.title || `AI日报 — ${raw.date || ""}`.trim();
  const sections = [];

  if (Array.isArray(raw.summary) && raw.summary.length > 0) {
    sections.push({
      heading: "今日摘要",
      cards: raw.summary.map((text) => ({ title: text, details: [] })),
    });
  }

  for (const section of raw.sections || []) {
    sections.push({
      heading: section.heading || section.id || "未命名分区",
      cards: (section.items || []).map(jsonItemToCard),
    });
  }

  return { title, sections };
}

function jsonItemToCard(item) {
  const titleParts = [];
  if (item.source) titleParts.push(`[${item.source}]`);
  titleParts.push(item.url ? `[${item.title}](${item.url})` : item.title);

  const details = [];
  appendDetail(details, "层级", item.layer);
  appendDetail(details, "今日新增", item.today_delta);
  appendDetail(details, "判断", item.judgment);
  appendDetail(details, "对比", item.comparison);
  appendDetail(details, "影响", item.impact);
  appendDetail(details, "观察", item.watch);

  for (const detail of item.details || []) {
    appendDetail(details, detail.label, detail.value);
  }

  return {
    title: titleParts.filter(Boolean).join(" "),
    details,
  };
}

function appendDetail(details, label, value) {
  if (!value) return;
  details.push(`${label}: ${value}`);
}

function extractTitle(md) {
  const titleLine = md.split("\n").find((line) => /^#{1,3}\s+/.test(line));
  return titleLine ? titleLine.replace(/^#{1,3}\s+/, "").trim() : "AI日报";
}

function parseSections(md) {
  const lines = md.split("\n");
  const sections = [];
  let current = null;
  let intro = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      if (current) sections.push(current);
      current = { heading: sectionMatch[1].trim(), lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
    else if (!/^#{1,2}\s+/.test(line)) intro.push(line);
  }

  if (current) sections.push(current);

  const parsed = sections.map((section) => ({
    ...section,
    cards: parseCards(section.lines),
  }));

  const introCards = parseCards(intro);
  if (introCards.length > 0) {
    parsed.unshift({ heading: "今日摘要", lines: intro, cards: introCards });
  }

  return parsed;
}

function parseCards(lines) {
  const cards = [];
  let current = null;
  let looseParagraph = [];

  const flushParagraph = () => {
    const text = looseParagraph.join(" ").trim();
    if (text) cards.push({ title: text, details: [] });
    looseParagraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    if (!line.trim()) continue;

    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (current) cards.push(current);
      current = { title: bulletMatch[1].trim(), details: [] };
      continue;
    }

    const detail = line.trim();
    if (current) current.details.push(detail);
    else looseParagraph.push(detail);
  }

  flushParagraph();
  if (current) cards.push(current);
  return cards;
}

function renderPage({ digest, sourceFile }) {
  const { title, sections } = digest;
  const nav = sections
    .map((section, index) => {
      const id = sectionId(section.heading, index);
      return `<a href="#${id}">${inline(section.heading)}</a>`;
    })
    .join("");

  const body = sections
    .map((section, index) => renderSection(section, sectionId(section.heading, index)))
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(stripMarkdown(title))}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --paper: #ffffff;
      --ink: #172033;
      --muted: #667085;
      --line: #d9dee8;
      --blue: #2554c7;
      --teal: #0f766e;
      --rose: #be123c;
      --amber: #b45309;
      --shadow: 0 18px 42px rgba(23, 32, 51, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.65;
      letter-spacing: 0;
    }

    a { color: inherit; }

    .page {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 56px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: end;
      padding: 28px 0 22px;
      border-bottom: 1px solid var(--line);
    }

    h1 {
      margin: 0;
      max-width: 780px;
      font-size: 34px;
      line-height: 1.18;
      font-weight: 780;
    }

    .source-file {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 18px 0 6px;
    }

    .nav a {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      color: #31405d;
      font-size: 14px;
      text-decoration: none;
    }

    .section {
      margin-top: 28px;
    }

    .section-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }

    h2 {
      margin: 0;
      font-size: 21px;
      line-height: 1.25;
    }

    .count {
      color: var(--muted);
      font-size: 13px;
    }

    .cards {
      display: grid;
      gap: 12px;
    }

    .card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      box-shadow: var(--shadow);
    }

    .card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: var(--blue);
    }

    .card.priority::before { background: var(--rose); }
    .card.important::before { background: var(--blue); }
    .card.tracking::before { background: var(--teal); }
    .card.summary::before { background: var(--amber); }

    .card-body {
      padding: 16px 18px 16px 20px;
    }

    .card-title {
      margin: 0;
      font-size: 16px;
      line-height: 1.45;
      font-weight: 720;
    }

    .details {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .detail {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      color: #344054;
      font-size: 14px;
    }

    .detail-label {
      color: var(--muted);
      font-weight: 700;
      white-space: nowrap;
    }

    .detail-value {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .detail.plain {
      display: block;
    }

    code {
      padding: 1px 5px;
      border-radius: 5px;
      background: #eef2ff;
      color: #243b8f;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }

    strong { font-weight: 760; }

    @media (max-width: 720px) {
      .page {
        width: min(100vw - 24px, 1120px);
        padding-top: 18px;
      }

      .hero {
        grid-template-columns: 1fr;
        gap: 8px;
      }

      h1 { font-size: 26px; }

      .source-file { text-align: left; }

      .detail {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <h1>${inline(title)}</h1>
      <div class="source-file">${escapeHtml(sourceFile)}</div>
    </header>
    <nav class="nav" aria-label="日报分区">${nav}</nav>
    ${body}
  </main>
</body>
</html>
`;
}

function renderSection(section, id) {
  const cards = section.cards
    .map((card) => renderCard(card, cardKind(section.heading)))
    .join("\n");

  return `<section class="section" id="${id}">
  <div class="section-header">
    <h2>${inline(section.heading)}</h2>
    <span class="count">${section.cards.length} items</span>
  </div>
  <div class="cards">
    ${cards || `<article class="card"><div class="card-body"><p class="card-title">暂无内容</p></div></article>`}
  </div>
</section>`;
}

function renderCard(card, kind) {
  const details = card.details.map(renderDetail).join("\n");
  return `<article class="card ${kind}">
  <div class="card-body">
    <p class="card-title">${inline(card.title)}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
  </div>
</article>`;
}

function renderDetail(detail) {
  const match = detail.match(/^([^：:]{1,8})[：:]\s*(.+)$/);
  if (!match) {
    return `<div class="detail plain"><span class="detail-value">${inline(detail)}</span></div>`;
  }

  return `<div class="detail">
  <span class="detail-label">${inline(match[1])}</span>
  <span class="detail-value">${inline(match[2])}</span>
</div>`;
}

function cardKind(heading) {
  if (/最高|优先|🔥/.test(heading)) return "priority";
  if (/重要|📚/.test(heading)) return "important";
  if (/追踪|观察|⏭/.test(heading)) return "tracking";
  return "summary";
}

function sectionId(heading, index) {
  return `section-${index}-${stripMarkdown(heading)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")}`;
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function stripMarkdown(value) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
