#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(args.length === 0 ? 1 : 0);
}

let inputPath;
let outputPath;
let recursive = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--output" || arg === "-o") {
    outputPath = args[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--recursive" || arg === "-r") {
    recursive = true;
    continue;
  }
  if (!inputPath) {
    inputPath = arg;
    continue;
  }
  fail(`Unexpected argument: ${arg}`);
}

if (!inputPath) fail("Missing input path.");

const input = resolve(inputPath);
if (!existsSync(input)) fail(`Input does not exist: ${input}`);

const inputStat = statSync(input);
const renderScript = resolve("scripts/render-digest-html.mjs");
if (!existsSync(renderScript)) fail(`Missing renderer: ${renderScript}`);

const jobs = inputStat.isDirectory()
  ? collectMarkdownFiles(input, recursive).map((file) => ({
      input: file,
      output: outputPath
        ? join(resolve(outputPath), htmlName(file))
        : join(input, htmlName(file)),
    }))
  : [
      {
        input,
        output: outputPath ? resolve(outputPath) : replaceExtension(input, ".html"),
      },
    ];

if (jobs.length === 0) fail(`No Markdown files found in ${input}`);

for (const job of jobs) {
  mkdirSync(dirname(job.output), { recursive: true });
  const result = spawnSync(process.execPath, [renderScript, job.input, job.output], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  console.log(`${job.input} -> ${job.output}`);
}

function collectMarkdownFiles(dir, includeNested) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (includeNested) files.push(...collectMarkdownFiles(fullPath, includeNested));
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function htmlName(file) {
  return basename(file).replace(/\.md$/i, ".html");
}

function replaceExtension(file, nextExt) {
  return file.replace(/\.[^.]+$/u, nextExt);
}

function printUsage() {
  console.error(`Usage:
  node scripts/convert-md-to-html.mjs <report.md> [--output report.html]
  node scripts/convert-md-to-html.mjs <reports-dir> [--output html-dir] [--recursive]

Examples:
  node scripts/convert-md-to-html.mjs "/Users/mac/AI progresses/2026-05-22.md"
  node scripts/convert-md-to-html.mjs "/Users/mac/AI progresses" --output "/Users/mac/AI progresses/html"
`);
}

function fail(message) {
  console.error(message);
  printUsage();
  process.exit(1);
}
