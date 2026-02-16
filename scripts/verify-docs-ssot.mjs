// scripts/verify-docs-ssot.mjs
// Cross-platform SSOT Docs Gate (Node-only, no pwsh dependency)
// Rules:
// 1) docs/MASTER_SPEC.zh.md + docs/PLAN_CURRENT.md (+ optional docs/INDEX.md) must exist
// 2) SSOT must contain required deprecated anchors
// 3) Every doc under docs/ with <!-- DEPRECATED ... --> must have <!-- replacement: docs/MASTER_SPEC.zh.md#deprecated-... -->
// 4) Optional warning if EXPERT_IMPLEMENTATION_AUDIT.md is referenced anywhere in docs/
// 5) HARD: If a doc contains verify:dev / verify:check command, it MUST include a SSOT link (docs/MASTER_SPEC.zh.md#...)

import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DOCS_ROOT = path.join(PROJECT_ROOT, "docs");
const SSOT_PATH = path.join(DOCS_ROOT, "MASTER_SPEC.zh.md");
const PLAN_PATH = path.join(DOCS_ROOT, "PLAN_CURRENT.md");
const INDEX_PATH = path.join(DOCS_ROOT, "INDEX.md");

// If you don't want INDEX.md mandatory, set to false.
const REQUIRE_INDEX = true;

const DOC_EXTS = new Set([".md", ".mdx", ".rst"]);

// HARD RULE config: any doc that mentions verify commands must link SSOT
const VERIFY_CMD_RE = /\b(npm\s+run\s+)?verify:(dev|check)\b/i;
// Acceptable SSOT links (keep stable): any docs/MASTER_SPEC.zh.md#... is fine,
// but you can tighten this list to specific anchors if you want.
const SSOT_LINK_RE = /docs\/MASTER_SPEC\.zh\.md#[a-z0-9\u4e00-\u9fff\-_]+/i;
// Optional: encourage linking the canonical section/anchors
const PREFERRED_SSOT_LINKS = [
  /docs\/MASTER_SPEC\.zh\.md#deprecated-root-migration-audit/i,
  /docs\/MASTER_SPEC\.zh\.md#deprecated-optimization-complete/i,
  /docs\/MASTER_SPEC\.zh\.md#4-门禁与验证/i,
];

function fail(msg) {
  console.error(`SSOT DOCS GATE FAIL: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`SSOT DOCS GATE WARN: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p) {
  return await fs.readFile(p, "utf8");
}

function headLines(text, n = 80) {
  const lines = text.split(/\r?\n/);
  return lines.slice(0, n).join("\n");
}

async function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function hasDeprecatedMarker(text) {
  return /<!--\s*DEPRECATED\b/i.test(text);
}

function extractReplacementFromHead(headText) {
  // match line like: <!-- replacement: docs/MASTER_SPEC.zh.md#deprecated-root-migration-audit -->
  const m = headText.match(/^\s*<!--\s*replacement:\s*([^>]+?)\s*-->\s*$/im);
  return m ? m[1].trim() : null;
}

function isValidReplacement(link) {
  // Normalize slashes for check
  const norm = link.replace(/\\/g, "/");
  return /^docs\/MASTER_SPEC\.zh\.md#deprecated-[a-z0-9\-]+$/i.test(norm);
}

async function main() {
  if (!(await exists(DOCS_ROOT))) fail(`missing docs/: ${DOCS_ROOT}`);
  if (!(await exists(SSOT_PATH))) fail(`missing SSOT: ${SSOT_PATH}`);
  if (!(await exists(PLAN_PATH))) fail(`missing PLAN_CURRENT: ${PLAN_PATH}`);
  if (REQUIRE_INDEX && !(await exists(INDEX_PATH))) fail(`missing docs/INDEX.md: ${INDEX_PATH}`);

  const ssot = await readText(SSOT_PATH);

  // Required anchor ids (stable)
  const requiredAnchors = [
    'id="deprecated-targets"',
    'id="deprecated-root-migration-audit"',
    'id="deprecated-optimization-complete"',
  ];

  for (const a of requiredAnchors) {
    if (!ssot.includes(a)) fail(`SSOT missing anchor: ${a}`);
  }
  ok("SSOT anchors present");

  const all = await walk(DOCS_ROOT);
  const docFiles = all.filter((p) => DOC_EXTS.has(path.extname(p).toLowerCase()));
  if (!docFiles.length) fail(`no docs found under: ${DOCS_ROOT}`);
  ok(`Docs scanned: ${docFiles.length}`);

  const deprecatedFiles = [];
  const legacyAuditRefs = [];
  const verifyCmdNoSsotLink = [];
  const verifyCmdHasSsotLinkButNotPreferred = [];

  for (const f of docFiles) {
    let text;
    try {
      text = await readText(f);
    } catch {
      continue;
    }

    if (/EXPERT_IMPLEMENTATION_AUDIT\.md/i.test(text)) {
      legacyAuditRefs.push(path.relative(PROJECT_ROOT, f));
    }

    if (hasDeprecatedMarker(text)) {
      deprecatedFiles.push({ file: f, text });
    }

    // HARD RULE 5:
    // If doc contains verify:dev/check command, it must contain an SSOT link somewhere in the doc.
    // Exemptions: SSOT itself, PLAN_CURRENT, INDEX
    if (VERIFY_CMD_RE.test(text)) {
      const rel = path.relative(PROJECT_ROOT, f).replace(/\\/g, "/");
      const isExempt = rel === "docs/MASTER_SPEC.zh.md" || 
                       rel === "docs/PLAN_CURRENT.md" || 
                       rel === "docs/INDEX.md";
      if (!isExempt && !SSOT_LINK_RE.test(text)) {
        verifyCmdNoSsotLink.push(rel);
      } else if (!isExempt) {
        // Soft preference: warn if not linking canonical anchors/section
        const okPreferred = PREFERRED_SSOT_LINKS.some((re) => re.test(text));
        if (!okPreferred) verifyCmdHasSsotLinkButNotPreferred.push(rel);
      }
    }
  }

  ok(`Deprecated docs found: ${deprecatedFiles.length}`);

  const missingReplacement = [];
  const badReplacement = [];

  for (const { file, text } of deprecatedFiles) {
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
    // Skip INDEX.md which should not be deprecated
    if (rel === "docs/INDEX.md") continue;
    
    const head = headLines(text, 80);
    const repl = extractReplacementFromHead(head);

    if (!repl) {
      missingReplacement.push(rel);
      continue;
    }
    if (!isValidReplacement(repl)) {
      badReplacement.push(`${rel} => ${repl}`);
    }
  }

  if (missingReplacement.length) {
    fail(
      `DEPRECATED but missing replacement header in ${missingReplacement.length} file(s). Example: ${missingReplacement[0]}`
    );
  }

  if (badReplacement.length) {
    console.error("Bad replacement targets (must point to docs/MASTER_SPEC.zh.md#deprecated-...):");
    for (const line of badReplacement.slice(0, 30)) console.error(`  ${line}`);
    fail(`replacement invalid. bad=${badReplacement.length}`);
  }

  ok("All DEPRECATED replacement targets point to SSOT anchors");

  // Enforce HARD RULE 5
  if (verifyCmdNoSsotLink.length) {
    console.error("Docs mention verify:dev/check but do NOT link SSOT (docs/MASTER_SPEC.zh.md#...):");
    for (const p of verifyCmdNoSsotLink.slice(0, 30)) console.error(`  ${p}`);
    fail(`verify command requires SSOT link. bad=${verifyCmdNoSsotLink.length}`);
  }
  ok("All docs that mention verify:dev/check include a SSOT link");

  // Soft nudge: prefer canonical anchors/section
  if (verifyCmdHasSsotLinkButNotPreferred.length) {
    warn(
      `verify docs include SSOT link but not preferred anchors/section in ${verifyCmdHasSsotLinkButNotPreferred.length} file(s). Consider linking #4-门禁与验证 or #deprecated-root-migration-audit.`
    );
  }

  if (legacyAuditRefs.length) {
    warn(
      `Found references to EXPERT_IMPLEMENTATION_AUDIT.md in ${legacyAuditRefs.length} doc(s). Consider migrating links to SSOT anchors.`
    );
  }

  ok("SSOT DOCS GATE PASS");
  process.exit(0);
}

main().catch((e) => fail(e?.stack || String(e)));
