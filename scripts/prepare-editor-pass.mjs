#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [, , runDir] = process.argv;

if (!runDir) {
  console.error("Usage: node scripts/prepare-editor-pass.mjs <run-dir>");
  process.exit(1);
}

const stateDir = join(runDir, "state");
const candidates = readJsonl(join(stateDir, "candidates.jsonl"));
const sources = readJsonl(join(stateDir, "sources.jsonl"));
const articleFetches = readJsonl(join(stateDir, "article-fetches.jsonl"));
const prompt = readFileSync("references/prompts/backend-editor.md", "utf8");

const editorInput = {
  run_id: basename(runDir),
  date: new Date().toISOString().slice(0, 10),
  source_summary: summarizeFetches(sources),
  article_summary: summarizeFetches(articleFetches),
  style_examples: readStyleExamples(),
  candidates: candidates.slice(0, 30).map((candidate) => ({
    rank: candidate.rank,
    source: candidate.source,
    category: candidate.category,
    title: candidate.title,
    url: candidate.url,
    layer_guess: candidate.layer_guess,
    published_at: candidate.published_at,
    final_score: candidate.final_score,
    score_breakdown: candidate.score_breakdown,
    evidence_summary: truncate(candidate.evidence_summary, 1200),
    headings: candidate.headings || [],
    source_raw_path_relative: candidate.source_raw_path_relative,
    article_raw_path_relative: candidate.article_raw_path_relative,
    source_sha256: candidate.source_sha256,
    article_sha256: candidate.article_sha256,
    article_excerpt: excerpt(candidate.article_raw_path, 1800),
  })),
};

const editorInputPath = join(stateDir, "editor-input.json");
const editorPromptPath = join(stateDir, "editor-prompt.md");

writeFileSync(editorInputPath, JSON.stringify(editorInput, null, 2) + "\n");
writeFileSync(editorPromptPath, `${prompt}\n\n---\n\n# editor-input.json\n\n\`\`\`json\n${JSON.stringify(editorInput, null, 2)}\n\`\`\`\n`);

console.log(editorInputPath);
console.log(editorPromptPath);

function readJsonl(path) {
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function summarizeFetches(rows) {
  const ok = rows.filter((row) => row.ok).length;
  return {
    total: rows.length,
    ok,
    failed: rows.length - ok,
    failures: rows
      .filter((row) => !row.ok)
      .slice(0, 10)
      .map((row) => ({
        source: row.source,
        title: row.title,
        status: row.status,
        error: row.error,
        url: row.url || row.item_url,
      })),
  };
}

function excerpt(path, limit) {
  if (!path) return "";
  try {
    return truncate(cleanText(readFileSync(path, "utf8")), limit);
  } catch {
    return "";
  }
}

function cleanText(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function readStyleExamples() {
  const examples = [];
  const paths = [
    "/Users/mac/AI progresses/2026-05-22.md",
    "/Users/mac/AI progresses/2026-05-21.md",
  ];

  for (const path of paths) {
    try {
      examples.push({
        path,
        excerpt: truncate(readFileSync(path, "utf8"), 6000),
      });
    } catch {
      // Style examples are helpful but should not block editor input generation.
    }
  }

  return examples;
}
