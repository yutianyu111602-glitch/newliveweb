import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/').replace('/scripts', '');

/**
 * Guardrails goals:
 * - Catch encoding corruption (U+FFFD replacement char "�")
 * - Catch common template-string breakage artifacts that have bitten us
 */
const FILES_TO_CHECK = [
  'src/main.ts',
  'REFRACTOR_SPEC_FOR_AI.zh.md',
  'REFRACTOR_PLAN.zh.md'
];

const REPLACEMENT_CHAR = '\uFFFD';

const BAD_PATTERNS = [
  { name: 'replacement-char', re: new RegExp(REPLACEMENT_CHAR, 'g') },
  // Typical corruption we saw when formatters/encodings mangled Chinese punctuation in attributes
  { name: 'broken-title-seconds', re: /自动轮播间隔（秒\?\?>/g },
  // Typical broken closing tag in HTML template
  { name: 'broken-span-close', re: /<span>库模\?\?\/span>/g },
  // Broken TS template interpolation that becomes a literal "?{" sequence
  { name: 'broken-template-interpolation', re: /\?\{[A-Z0-9_]+\}/g }
];

const REQUIRED_VENDOR_RESOURCES = [
  'public/vendor/mediapipe/selfie_segmentation/selfie_segmentation.tflite',
  'public/vendor/essentia/essentia-wasm.web.wasm'
];

function formatLoc(file, index, content) {
  const before = content.slice(0, index);
  const line = before.split('\n').length;
  const col = before.length - before.lastIndexOf('\n');
  return `${file}:${line}:${col}`;
}

async function main() {
  const problems = [];

  for (const rel of FILES_TO_CHECK) {
    const abs = path.join(projectRoot, rel);
    let content;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch (e) {
      // Ignore missing files to keep guardrail permissive across branches.
      continue;
    }

    for (const { name, re } of BAD_PATTERNS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(content))) {
        problems.push({ file: rel, name, at: formatLoc(rel, match.index, content) });
        // Avoid spamming too much output for the same pattern in huge files.
        if (problems.length > 50) break;
      }
      if (problems.length > 50) break;
    }

    if (problems.length > 50) break;
  }

  if (problems.length) {
    console.error('[guardrails] FAILED. Found likely encoding/template corruption:');
    for (const p of problems) {
      console.error(`- ${p.at} (${p.name})`);
    }
    console.error('\nFix the corruption (usually an encoding/formatter issue) before continuing.');
    process.exit(1);
  }

  // Check critical vendor resources exist (prevent 404 in production)
  const missingResources = [];
  for (const res of REQUIRED_VENDOR_RESOURCES) {
    const abs = path.join(projectRoot, res);
    try {
      await fs.stat(abs);
    } catch {
      missingResources.push(res);
    }
  }

  if (missingResources.length) {
    console.error('[guardrails] FAILED. Missing vendor resources (will 404 in production):');
    for (const res of missingResources) {
      console.error(`- ${res}`);
    }
    console.error('\nRun sync scripts:');
    console.error('  npm run sync:mediapipe');
    console.error('  npm run sync:essentia');
    process.exit(1);
  }

  console.log('[guardrails] OK');
}

await main();
