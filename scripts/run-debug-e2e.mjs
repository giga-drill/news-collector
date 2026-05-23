#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT_OUTPUT = "/Users/mac/AI progresses/debug-runs";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const [, , ...args] = process.argv;
const options = parseArgs(args);
const sourceLimit = Number(options.limit || process.env.NEWS_DEBUG_SOURCE_LIMIT || 8);
const outputRoot = options.outputRoot || ROOT_OUTPUT;
const runDir = join(outputRoot, RUN_ID);
const rawDir = join(runDir, "raw");
const stateDir = join(runDir, "state");

mkdirSync(rawDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const sources = parseSources(readFileSync("references/sources.md", "utf8")).slice(0, sourceLimit);
const sourceRecords = [];
const allCandidates = [];

for (const [index, source] of sources.entries()) {
  const record = await fetchSource(source, index + 1);
  sourceRecords.push(record);
  if (record.ok && record.raw_path) {
    const body = readFileSync(record.raw_path, "utf8");
    const candidates = extractCandidates(body, record).slice(0, 8);
    allCandidates.push(...candidates);
  }
}

const rankedCandidates = rankCandidates(allCandidates);
const digest = buildDigest(rankedCandidates, sourceRecords);
const markdown = renderMarkdown(digest);

writeJsonl(join(stateDir, "sources.jsonl"), sourceRecords);
writeJsonl(join(stateDir, "candidates.jsonl"), rankedCandidates);
writeFileSync(join(stateDir, "digest.json"), JSON.stringify(digest, null, 2) + "\n");
writeFileSync(join(runDir, "digest.md"), markdown);

const render = spawnSync(
  process.execPath,
  ["scripts/render-digest-html.mjs", join(stateDir, "digest.json"), join(runDir, "digest.html")],
  { encoding: "utf8" }
);
if (render.status !== 0) {
  console.error(render.stderr || render.stdout);
  process.exit(render.status || 1);
}

writeFileSync(join(runDir, "run-summary.json"), JSON.stringify({
  run_id: RUN_ID,
  run_dir: runDir,
  source_limit: sourceLimit,
  sources_checked: sourceRecords.length,
  sources_ok: sourceRecords.filter((record) => record.ok).length,
  candidates: rankedCandidates.length,
  outputs: {
    raw_dir: rawDir,
    sources_jsonl: join(stateDir, "sources.jsonl"),
    candidates_jsonl: join(stateDir, "candidates.jsonl"),
    digest_json: join(stateDir, "digest.json"),
    digest_md: join(runDir, "digest.md"),
    digest_html: join(runDir, "digest.html"),
  },
}, null, 2) + "\n");

console.log(runDir);

async function fetchSource(source, index) {
  const startedAt = new Date().toISOString();
  const slug = `${String(index).padStart(2, "0")}-${slugify(source.name)}`;
  const metaPath = join(rawDir, `${slug}.meta.json`);
  const bodyPath = join(rawDir, `${slug}.body.txt`);

  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: {
        "accept": "text/html,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "news-collector-debug/0.1 (+local debug run)",
      },
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const sha256 = createHash("sha256").update(body).digest("hex");

    writeFileSync(bodyPath, body);
    writeFileSync(metaPath, JSON.stringify({
      source,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      final_url: response.url,
      status: response.status,
      status_text: response.statusText,
      headers,
      sha256,
      bytes: Buffer.byteLength(body),
    }, null, 2) + "\n");

    return {
      type: "source_check",
      source: source.name,
      category: source.category,
      url: source.url,
      final_url: response.url,
      ok: response.ok,
      status: response.status,
      content_type: headers["content-type"] || null,
      bytes: Buffer.byteLength(body),
      sha256,
      raw_path: bodyPath,
      meta_path: metaPath,
      raw_path_relative: relative(runDir, bodyPath),
      meta_path_relative: relative(runDir, metaPath),
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    writeFileSync(metaPath, JSON.stringify({
      source,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error: String(error && error.message ? error.message : error),
    }, null, 2) + "\n");

    return {
      type: "source_check",
      source: source.name,
      category: source.category,
      url: source.url,
      ok: false,
      status: null,
      error: String(error && error.message ? error.message : error),
      raw_path: null,
      meta_path: metaPath,
      meta_path_relative: relative(runDir, metaPath),
      checked_at: new Date().toISOString(),
    };
  }
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
    if (item) {
      sources.push({ name: item[1].trim(), url: item[2].trim(), category });
    }
  }

  return sources;
}

function extractCandidates(body, sourceRecord) {
  const text = decodeEntities(body);
  const candidates = [];
  const seen = new Set();

  for (const match of text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = normalizeUrl(match[1], sourceRecord.final_url || sourceRecord.url);
    const title = cleanText(match[2]);
    if (!href || !title || title.length < 12 || title.length > 180) continue;
    if (seen.has(`${title} ${href}`)) continue;
    seen.add(`${title} ${href}`);
    candidates.push(makeCandidate({ title, url: href, sourceRecord, evidence: title }));
  }

  for (const match of text.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const title = cleanText(match[1]);
    if (!title || title.length < 12 || title.length > 180) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    candidates.push(makeCandidate({ title, url: sourceRecord.final_url || sourceRecord.url, sourceRecord, evidence: title }));
  }

  return candidates;
}

function makeCandidate({ title, url, sourceRecord, evidence }) {
  const score = scoreTitle(title, sourceRecord);
  return {
    type: "candidate",
    source: sourceRecord.source,
    category: sourceRecord.category,
    source_url: sourceRecord.url,
    title,
    url,
    layer_guess: guessLayer(title),
    score,
    evidence_summary: evidence,
    raw_path: sourceRecord.raw_path,
    raw_path_relative: sourceRecord.raw_path_relative,
    source_sha256: sourceRecord.sha256,
    selected: false,
    selection_reason: "candidate_extracted_from_raw_fetch",
    extracted_at: new Date().toISOString(),
  };
}

function rankCandidates(candidates) {
  const seen = new Set();
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const key = candidate.title.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return candidate.score > 0;
    })
    .slice(0, 24)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      selected: index < 11,
      selection_reason: index < 3 ? "promoted_to_top_by_debug_score" : index < 11 ? "included_as_important_by_debug_score" : "kept_for_debug_review",
    }));
}

function buildDigest(candidates, sourceRecords) {
  const top = candidates.slice(0, 3).map(candidateToDigestItem);
  const important = candidates.slice(3, 11).map(candidateToDigestItem);
  const failedSources = sourceRecords.filter((record) => !record.ok);

  return {
    date: new Date().toISOString().slice(0, 10),
    title: `AI日报调试跑 — ${new Date().toISOString().slice(0, 10)}`,
    summary: [
      `本次调试检查 ${sourceRecords.length} 个信息源，成功 ${sourceRecords.filter((record) => record.ok).length} 个，抽取候选 ${candidates.length} 条。`,
      "这是规则型端到端 smoke test，用来验证抓取、原文持久化、中间状态和 HTML 渲染链路，不代表最终编辑质量。",
    ],
    sections: [
      { id: "top", heading: "🔥 最高优先级（调试候选）", items: top },
      { id: "important", heading: "📚 重要动态（调试候选）", items: important },
      {
        id: "tracking",
        heading: "⏭️ 调试观察",
        items: [
          {
            title: "原始抓取已持久化",
            watch: `每个成功源都有 raw/*.body.txt 和 raw/*.meta.json；失败源保留 meta error，方便复查。`,
          },
          {
            title: "候选抽取仍是规则型",
            watch: "当前只用链接标题、标题标签和关键词打分，下一步应接入 LLM/编辑 prompt 来生成更好的 evidence_summary、today_delta 和判断。",
          },
          failedSources.length > 0
            ? {
                title: "部分源抓取失败",
                watch: failedSources.map((record) => `${record.source}: ${record.error || record.status}`).join("；"),
              }
            : {
                title: "本次调试源抓取未出现失败",
                watch: "可以扩大 --limit 覆盖更多信息源，观察反爬、超时和内容结构差异。",
              },
        ],
      },
    ],
    meta: {
      run_id: RUN_ID,
      run_dir: runDir,
      raw_dir: rawDir,
      state_dir: stateDir,
      generated_by: "scripts/run-debug-e2e.mjs",
    },
  };
}

function candidateToDigestItem(candidate) {
  return {
    source: candidate.source,
    url: candidate.url,
    title: candidate.title,
    layer: candidate.layer_guess,
    today_delta: `从 ${candidate.source} 抓取页抽取到该候选；调试分 ${candidate.score}。`,
    judgment: "调试版仅根据标题关键词、来源类别和链接结构做初筛；正式版应在这里接入后端内容 prompt 做事实核验和编辑判断。",
    comparison: `原始证据保存在 ${candidate.raw_path_relative}，sha256=${candidate.source_sha256?.slice(0, 12) || "n/a"}。`,
    impact: "这个条目展示从原始网页到候选池再到前端 digest 的可追踪链路。",
  };
}

function renderMarkdown(digest) {
  const lines = [`## ${digest.title}`, ""];
  for (const item of digest.summary || []) {
    lines.push(`- ${item}`);
  }
  if (digest.summary?.length) lines.push("");

  for (const section of digest.sections) {
    lines.push(`### ${section.heading}`, "");
    for (const item of section.items) {
      lines.push(`- [${item.source || "Debug"}] ${item.title}${item.url ? ` (${item.url})` : ""}`);
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

function scoreTitle(title, sourceRecord) {
  const lower = title.toLowerCase();
  const terms = [
    "ai", "agent", "agents", "model", "llm", "gpt", "claude", "gemini", "qwen",
    "openai", "anthropic", "benchmark", "reasoning", "coding", "code", "workflow",
    "tool", "tools", "automation", "robot", "research", "paper", "arxiv", "eval",
    "inference", "token", "context", "multimodal", "developer", "release", "launch",
  ];
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += 3;
  }
  if (/Official|Research|Coding|Developer/i.test(sourceRecord.category)) score += 5;
  if (title.length >= 25 && title.length <= 120) score += 2;
  if (/comments|login|subscribe|privacy|cookie|advertise|sign in/i.test(title)) score -= 12;
  return score;
}

function guessLayer(title) {
  const lower = title.toLowerCase();
  const layers = [];
  if (/model|llm|gpt|claude|gemini|qwen|benchmark|reasoning|inference|token|context/.test(lower)) {
    layers.push("模型层");
  }
  if (/agent|tool|automation|computer use|mcp|assistant|workflow/.test(lower)) {
    layers.push("Agent层");
  }
  if (/coding|developer|github|cursor|ide|review|workflow|productivity/.test(lower)) {
    layers.push("工作流/范式层");
  }
  return layers.length ? layers.join(" / ") : "待判定";
}

function cleanText(value) {
  return decodeEntities(value)
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
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function writeJsonl(path, records) {
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "source";
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--limit") parsed.limit = values[++index];
    else if (value === "--output-root") parsed.outputRoot = values[++index];
  }
  return parsed;
}
