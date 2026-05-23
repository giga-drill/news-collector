#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_OUTPUT_ROOT = "/Users/mac/AI progresses/debug-runs";
const args = parseArgs(process.argv.slice(2));
const sourceLimit = Number(args.limit || 20);
const perSourceLimit = Number(args.perSource || 12);
const articleLimit = Number(args.articleLimit || 120);
const outputRoot = args.outputRoot || DEFAULT_OUTPUT_ROOT;
const runId = `real-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const runDir = join(outputRoot, runId);
const rawSourceDir = join(runDir, "raw", "sources");
const rawArticleDir = join(runDir, "raw", "articles");
const stateDir = join(runDir, "state");

for (const dir of [rawSourceDir, rawArticleDir, stateDir]) {
  mkdirSync(dir, { recursive: true });
}

const sources = parseSources(readFileSync("references/sources.md", "utf8")).slice(0, sourceLimit);
const sourceChecks = [];
const sourceItems = [];
const articleFetches = [];
const candidates = [];

for (const [index, source] of sources.entries()) {
  const sourceCheck = await fetchToDisk({
    url: source.url,
    label: `${String(index + 1).padStart(2, "0")}-${slugify(source.name)}`,
    dir: rawSourceDir,
    context: { source },
  });
  sourceChecks.push(toSourceCheck(source, sourceCheck));

  if (!sourceCheck.ok) continue;

  const body = readFileSync(sourceCheck.bodyPath, "utf8");
  const extracted = extractSourceItems(body, source, sourceCheck.finalUrl)
    .slice(0, perSourceLimit)
    .map((item, itemIndex) => ({
      ...item,
      type: "source_item",
      source: source.name,
      category: source.category,
      source_url: source.url,
      source_raw_path: sourceCheck.bodyPath,
      source_raw_path_relative: relative(runDir, sourceCheck.bodyPath),
      source_sha256: sourceCheck.sha256,
      source_rank: itemIndex + 1,
      extracted_at: new Date().toISOString(),
    }));

  sourceItems.push(...extracted);
}

const articleQueue = rankSourceItems(sourceItems).slice(0, articleLimit);
for (const [index, item] of articleQueue.entries()) {
  const articleFetch = await fetchToDisk({
    url: item.url,
    label: `${String(index + 1).padStart(3, "0")}-${slugify(item.source)}-${hashShort(item.url)}`,
    dir: rawArticleDir,
    context: { item },
  });
  const record = toArticleFetch(item, articleFetch);
  articleFetches.push(record);

  if (!articleFetch.ok) continue;

  const body = readFileSync(articleFetch.bodyPath, "utf8");
  const candidate = buildCandidate(item, record, body);
  if (candidate.final_score > 0) candidates.push(candidate);
}

const rankedCandidates = rankCandidates(candidates);
const digest = buildDigest(rankedCandidates, sourceChecks, sourceItems, articleFetches);
const markdown = renderMarkdown(digest);

writeJsonl(join(stateDir, "sources.jsonl"), sourceChecks);
writeJsonl(join(stateDir, "source-items.jsonl"), sourceItems);
writeJsonl(join(stateDir, "article-fetches.jsonl"), articleFetches);
writeJsonl(join(stateDir, "candidates.jsonl"), rankedCandidates);
writeFileSync(join(stateDir, "digest.json"), JSON.stringify(digest, null, 2) + "\n");
writeFileSync(join(runDir, "digest.md"), markdown);

const render = spawnSync(process.execPath, [
  "scripts/render-digest-html.mjs",
  join(stateDir, "digest.json"),
  join(runDir, "digest.html"),
], { encoding: "utf8" });

if (render.status !== 0) {
  console.error(render.stderr || render.stdout);
  process.exit(render.status || 1);
}

const summary = {
  run_id: runId,
  run_dir: runDir,
  mode: "real_staged_crawl",
  source_limit: sourceLimit,
  per_source_limit: perSourceLimit,
  article_limit: articleLimit,
  sources_checked: sourceChecks.length,
  sources_ok: sourceChecks.filter((row) => row.ok).length,
  source_items: sourceItems.length,
  article_fetches: articleFetches.length,
  article_fetches_ok: articleFetches.filter((row) => row.ok).length,
  candidates: rankedCandidates.length,
  outputs: {
    raw_sources_dir: rawSourceDir,
    raw_articles_dir: rawArticleDir,
    sources_jsonl: join(stateDir, "sources.jsonl"),
    source_items_jsonl: join(stateDir, "source-items.jsonl"),
    article_fetches_jsonl: join(stateDir, "article-fetches.jsonl"),
    candidates_jsonl: join(stateDir, "candidates.jsonl"),
    digest_json: join(stateDir, "digest.json"),
    digest_md: join(runDir, "digest.md"),
    digest_html: join(runDir, "digest.html"),
  },
};
writeFileSync(join(runDir, "run-summary.json"), JSON.stringify(summary, null, 2) + "\n");

console.log(runDir);

async function fetchToDisk({ url, label, dir, context }) {
  const startedAt = new Date().toISOString();
  const bodyPath = join(dir, `${label}.body.txt`);
  const metaPath = join(dir, `${label}.meta.json`);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
      headers: {
        accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "news-collector-real-e2e/0.1 (+local debug run)",
      },
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const sha256 = createHash("sha256").update(body).digest("hex");
    const bytes = Buffer.byteLength(body);
    const finishedAt = new Date().toISOString();

    writeFileSync(bodyPath, body);
    writeFileSync(metaPath, JSON.stringify({
      requested_url: url,
      final_url: response.url,
      status: response.status,
      status_text: response.statusText,
      ok: response.ok,
      headers,
      sha256,
      bytes,
      context,
      started_at: startedAt,
      finished_at: finishedAt,
    }, null, 2) + "\n");

    return {
      requestedUrl: url,
      finalUrl: response.url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      sha256,
      bytes,
      bodyPath,
      metaPath,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    writeFileSync(metaPath, JSON.stringify({
      requested_url: url,
      ok: false,
      error: String(error?.message || error),
      context,
      started_at: startedAt,
      finished_at: finishedAt,
    }, null, 2) + "\n");

    return {
      requestedUrl: url,
      finalUrl: null,
      ok: false,
      status: null,
      statusText: null,
      headers: {},
      sha256: null,
      bytes: 0,
      bodyPath: null,
      metaPath,
      error: String(error?.message || error),
      startedAt,
      finishedAt,
    };
  }
}

function toSourceCheck(source, fetchResult) {
  return {
    type: "source_check",
    source: source.name,
    category: source.category,
    url: source.url,
    final_url: fetchResult.finalUrl,
    ok: fetchResult.ok,
    status: fetchResult.status,
    content_type: fetchResult.headers["content-type"] || null,
    bytes: fetchResult.bytes,
    sha256: fetchResult.sha256,
    raw_path: fetchResult.bodyPath,
    raw_path_relative: fetchResult.bodyPath ? relative(runDir, fetchResult.bodyPath) : null,
    meta_path: fetchResult.metaPath,
    meta_path_relative: relative(runDir, fetchResult.metaPath),
    error: fetchResult.error || null,
    checked_at: fetchResult.finishedAt,
  };
}

function toArticleFetch(item, fetchResult) {
  return {
    type: "article_fetch",
    source: item.source,
    category: item.category,
    title: item.title,
    item_url: item.url,
    final_url: fetchResult.finalUrl,
    ok: fetchResult.ok,
    status: fetchResult.status,
    content_type: fetchResult.headers["content-type"] || null,
    bytes: fetchResult.bytes,
    sha256: fetchResult.sha256,
    raw_path: fetchResult.bodyPath,
    raw_path_relative: fetchResult.bodyPath ? relative(runDir, fetchResult.bodyPath) : null,
    meta_path: fetchResult.metaPath,
    meta_path_relative: relative(runDir, fetchResult.metaPath),
    source_raw_path_relative: item.source_raw_path_relative,
    error: fetchResult.error || null,
    fetched_at: fetchResult.finishedAt,
  };
}

function parseSources(markdown) {
  const lines = markdown.split("\n");
  const sources = [];
  let category = "Uncategorized";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      category = heading[1].trim();
      continue;
    }

    const item = line.match(/^\d+\.\s+(.+?)\s+—\s+(https?:\/\/\S+)/);
    if (item) sources.push({ name: item[1].trim(), url: item[2].trim(), category });
  }

  return sources;
}

function extractSourceItems(body, source, baseUrl) {
  const items = [];
  const seen = new Set();

  for (const item of extractFeedItems(body, baseUrl)) addItem(item);
  for (const item of extractAnchorItems(body, baseUrl)) addItem(item);
  for (const item of extractHeadingItems(body, baseUrl)) addItem(item);

  return items
    .map((item) => ({
      ...item,
      is_probable_story: isProbableStory(item.title, item.url),
      extraction_score: sourceItemScore(item.title, source),
    }))
    .filter((item) => item.is_probable_story)
    .sort((a, b) => b.extraction_score - a.extraction_score);

  function addItem(item) {
    if (!item.url || !item.title) return;
    const key = `${item.title.toLowerCase()} ${item.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }
}

function extractFeedItems(body, baseUrl) {
  const items = [];
  for (const match of body.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const xml = match[0];
    items.push({
      title: cleanText(firstXml(xml, "title")),
      url: normalizeUrl(firstXml(xml, "link"), baseUrl),
      published_at: cleanText(firstXml(xml, "pubDate") || firstXml(xml, "dc:date")),
      summary: cleanText(firstXml(xml, "description")),
      extraction_method: "rss_item",
    });
  }
  for (const match of body.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const xml = match[0];
    const href = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || firstXml(xml, "link");
    items.push({
      title: cleanText(firstXml(xml, "title")),
      url: normalizeUrl(href, baseUrl),
      published_at: cleanText(firstXml(xml, "updated") || firstXml(xml, "published")),
      summary: cleanText(firstXml(xml, "summary") || firstXml(xml, "content")),
      extraction_method: "atom_entry",
    });
  }
  return items;
}

function extractAnchorItems(body, baseUrl) {
  const items = [];
  for (const match of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeUrl(match[1], baseUrl);
    const title = cleanText(match[2]);
    if (!url || !title) continue;
    items.push({
      title,
      url,
      published_at: null,
      summary: null,
      extraction_method: "html_anchor",
    });
  }
  return items;
}

function extractHeadingItems(body, baseUrl) {
  const items = [];
  for (const match of body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const title = cleanText(match[1]);
    if (!title) continue;
    items.push({
      title,
      url: baseUrl,
      published_at: null,
      summary: null,
      extraction_method: "html_heading",
    });
  }
  return items;
}

function buildCandidate(item, articleFetch, body) {
  const extracted = extractArticleEvidence(body);
  const title = extracted.title || item.title;
  const summary = extracted.description || item.summary || extracted.paragraphs.slice(0, 2).join(" ");
  const score = scoreCandidate({ title, summary, sourceItem: item, articleFetch });

  return {
    type: "candidate",
    source: item.source,
    category: item.category,
    title,
    url: articleFetch.final_url || item.url,
    source_url: item.source_url,
    layer_guess: guessLayer(`${title} ${summary}`),
    published_at: item.published_at || extracted.published_at || null,
    evidence_summary: summary,
    headings: extracted.headings.slice(0, 6),
    score_breakdown: score.breakdown,
    final_score: score.final,
    source_item_extraction_method: item.extraction_method,
    source_raw_path: item.source_raw_path,
    source_raw_path_relative: item.source_raw_path_relative,
    article_raw_path: articleFetch.raw_path,
    article_raw_path_relative: articleFetch.raw_path_relative,
    source_sha256: item.source_sha256,
    article_sha256: articleFetch.sha256,
    selected: false,
    selection_reason: "article_fetched_and_scored",
    extracted_at: new Date().toISOString(),
  };
}

function extractArticleEvidence(body) {
  const title =
    meta(body, "og:title") ||
    meta(body, "twitter:title") ||
    cleanText(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = meta(body, "description") || meta(body, "og:description") || meta(body, "twitter:description");
  const publishedAt =
    meta(body, "article:published_time") ||
    meta(body, "date") ||
    meta(body, "pubdate") ||
    body.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i)?.[1] ||
    null;
  const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((text) => text.length >= 40 && text.length <= 800)
    .slice(0, 8);

  return { title, description, published_at: publishedAt, headings, paragraphs };
}

function scoreCandidate({ title, summary, sourceItem }) {
  const text = `${title} ${summary || ""}`.toLowerCase();
  const keywordTerms = [
    "ai", "agent", "agents", "model", "llm", "gpt", "claude", "gemini", "qwen",
    "openai", "anthropic", "benchmark", "reasoning", "coding", "code", "workflow",
    "tool", "tools", "automation", "research", "paper", "arxiv", "eval", "inference",
    "token", "context", "multimodal", "developer", "release", "launch", "safety",
    "alignment", "robotics", "computer use", "mcp",
  ];
  const keywordScore = keywordTerms.reduce((score, term) => score + (text.includes(term) ? 2 : 0), 0);
  const sourceScore = /Official|Research/i.test(sourceItem.category)
    ? 8
    : /Coding|Developer/i.test(sourceItem.category)
      ? 7
      : /Media/i.test(sourceItem.category)
        ? 4
        : 3;
  const specificityScore = title.length >= 35 && title.length <= 160 ? 5 : title.length >= 16 ? 1 : -8;
  const evidenceScore = summary && summary.length >= 80 ? 5 : summary ? 2 : 0;
  const freshnessScore = freshnessFromDate(sourceItem.published_at);
  const noisePenalty = isGenericTitle(title) ? 15 : 0;
  const final = keywordScore + sourceScore + specificityScore + evidenceScore + freshnessScore - noisePenalty;

  return {
    final,
    breakdown: {
      keyword_score: keywordScore,
      source_score: sourceScore,
      specificity_score: specificityScore,
      evidence_score: evidenceScore,
      freshness_score: freshnessScore,
      noise_penalty: noisePenalty,
      final_score: final,
    },
  };
}

function rankSourceItems(items) {
  const seen = new Set();
  return [...items]
    .filter((item) => {
      const key = item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.extraction_score - a.extraction_score);
}

function rankCandidates(rows) {
  const seen = new Set();
  return [...rows]
    .filter((row) => {
      const key = row.url || row.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return !isGenericTitle(row.title);
    })
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, 30)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      selected: index < 12,
      selection_reason: index < 4 ? "promoted_to_top_by_real_scoring" : index < 12 ? "included_as_important_by_real_scoring" : "kept_for_review",
    }));
}

function buildDigest(candidates, sourceChecks, sourceItems, articleFetches) {
  return {
    date: new Date().toISOString().slice(0, 10),
    title: `AI新闻真实抓取调试 — ${new Date().toISOString().slice(0, 10)}`,
    summary: [
      `信息源 ${sourceChecks.length} 个，成功 ${sourceChecks.filter((row) => row.ok).length} 个；源页抽取 item ${sourceItems.length} 条；文章页抓取 ${articleFetches.length} 条，成功 ${articleFetches.filter((row) => row.ok).length} 条；候选 ${candidates.length} 条。`,
      "本页来自真实源页和文章页抓取，原始响应、meta、候选池和最终 digest 都已落盘，可逐层复查。",
    ],
    sections: [
      {
        id: "top",
        heading: "🔥 最高优先级（真实抓取候选）",
        items: candidates.slice(0, 4).map(candidateToDigestItem),
      },
      {
        id: "important",
        heading: "📚 重要动态（真实抓取候选）",
        items: candidates.slice(4, 12).map(candidateToDigestItem),
      },
      {
        id: "tracking",
        heading: "⏭️ 抓取诊断",
        items: diagnosticItems(sourceChecks, sourceItems, articleFetches),
      },
    ],
    meta: {
      run_id: runId,
      run_dir: runDir,
      raw_sources_dir: rawSourceDir,
      raw_articles_dir: rawArticleDir,
      state_dir: stateDir,
      generated_by: "scripts/run-real-e2e.mjs",
    },
  };
}

function candidateToDigestItem(candidate) {
  return {
    source: candidate.source,
    url: candidate.url,
    title: candidate.title,
    layer: candidate.layer_guess,
    today_delta: candidate.published_at
      ? `原文发布时间/页面时间：${candidate.published_at}；真实抓取候选分 ${candidate.final_score}。`
      : `真实抓取候选分 ${candidate.final_score}；页面未抽到明确发布时间。`,
    judgment: candidate.evidence_summary || "已抓取原文，但未抽到稳定摘要。",
    comparison: `评分拆分：${JSON.stringify(candidate.score_breakdown)}。`,
    impact: `原始源页：${candidate.source_raw_path_relative}；原始文章页：${candidate.article_raw_path_relative}。`,
  };
}

function diagnosticItems(sourceChecks, sourceItems, articleFetches) {
  const failedSources = sourceChecks.filter((row) => !row.ok);
  const failedArticles = articleFetches.filter((row) => !row.ok);
  return [
    {
      title: "原始信息已持久化",
      watch: `源页 raw 保存在 raw/sources，文章页 raw 保存在 raw/articles；每个 body 都有对应 meta.json 和 sha256。`,
    },
    {
      title: "中间状态可复查",
      watch: "sources.jsonl -> source-items.jsonl -> article-fetches.jsonl -> candidates.jsonl -> digest.json 是本次完整阶段链路。",
    },
    failedSources.length
      ? {
          title: "源页抓取失败",
          watch: failedSources.map((row) => `${row.source}: ${row.status || row.error}`).join("；"),
        }
      : {
          title: "源页抓取全部成功",
          watch: "本次源列表没有源页级失败。",
        },
    failedArticles.length
      ? {
          title: "文章页抓取失败",
          watch: failedArticles.slice(0, 8).map((row) => `${row.source}: ${row.status || row.error} ${row.item_url}`).join("；"),
        }
      : {
          title: "文章页抓取全部成功",
          watch: "本次进入 article queue 的页面都成功返回。",
        },
  ];
}

function renderMarkdown(digest) {
  const lines = [`## ${digest.title}`, ""];
  for (const item of digest.summary || []) lines.push(`- ${item}`);
  lines.push("");
  for (const section of digest.sections) {
    lines.push(`### ${section.heading}`, "");
    for (const item of section.items) {
      lines.push(`- [${item.source || "诊断"}] ${item.title}${item.url ? ` (${item.url})` : ""}`);
      if (item.layer) lines.push(`  层级：${item.layer}`);
      if (item.today_delta) lines.push(`  今日新增：${item.today_delta}`);
      if (item.judgment) lines.push(`  判断：${item.judgment}`);
      if (item.comparison) lines.push(`  对比：${item.comparison}`);
      if (item.impact) lines.push(`  影响：${item.impact}`);
      if (item.watch) lines.push(`  观察：${item.watch}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function sourceItemScore(title, source) {
  const text = title.toLowerCase();
  let score = /Official|Research/i.test(source.category) ? 8 : /Coding|Developer/i.test(source.category) ? 7 : 4;
  if (title.length >= 35 && title.length <= 180) score += 5;
  if (title.length < 12) score -= 12;
  if (isGenericTitle(title)) score -= 20;
  for (const term of ["ai", "agent", "model", "gpt", "claude", "gemini", "qwen", "openai", "anthropic", "coding", "benchmark", "research", "arxiv", "workflow", "mcp"]) {
    if (text.includes(term)) score += 3;
  }
  for (const term of ["deep research", "deepweb", "web bench", "rpa", "memory", "gui agent", "governance", "runtime", "codex", "copilot", "powerpoint", "trace", "attribution"]) {
    if (text.includes(term)) score += 5;
  }
  return score;
}

function isProbableStory(title, url) {
  if (!title || title.length < 12 || title.length > 220) return false;
  if (isGenericTitle(title)) return false;
  if (!/^https?:\/\//.test(url || "")) return false;
  return true;
}

function isGenericTitle(title) {
  return /^(home|news|blog|research|products?|pricing|docs?|developers?|developer tools|daily papers|papers|events|careers|about|contact|privacy|terms|login|log in|sign in|subscribe|advertise|cookies?|more|learn more|read more)$/i.test(title.trim())
    || /^(previous|next|menu|search|skip to|close|share|follow us)/i.test(title.trim());
}

function guessLayer(text) {
  const lower = text.toLowerCase();
  const layers = [];
  if (/model|llm|gpt|claude|gemini|qwen|benchmark|reasoning|inference|token|context|multimodal/.test(lower)) layers.push("模型层");
  if (/agent|tool|automation|computer use|mcp|assistant|workflow|robot/.test(lower)) layers.push("Agent层");
  if (/coding|developer|github|cursor|ide|review|workflow|productivity|copilot/.test(lower)) layers.push("工作流/范式层");
  return layers.length ? layers.join(" / ") : "待判定";
}

function freshnessFromDate(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  const ageDays = (Date.now() - time) / 86400000;
  if (ageDays <= 7) return 8;
  if (ageDays <= 14) return 4;
  return 0;
}

function meta(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return cleanText(match[1]);
  }
  return null;
}

function firstXml(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] || "";
}

function cleanText(value) {
  return decodeEntities(String(value || ""))
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeUrl(href, base) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return null;
  try {
    const url = new URL(href, base);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function writeJsonl(path, records) {
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

function hashShort(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "item";
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--limit") parsed.limit = values[++index];
    else if (value === "--per-source") parsed.perSource = values[++index];
    else if (value === "--article-limit") parsed.articleLimit = values[++index];
    else if (value === "--output-root") parsed.outputRoot = values[++index];
  }
  return parsed;
}
