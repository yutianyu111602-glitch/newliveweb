#!/usr/bin/env node
/**
 * 完整验收测试套件
 * 用法：node scripts/aivj/run-acceptance-tests.mjs
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

const RESULTS = [];
const HARD_TIMEOUT_MS = Number(process.env.AIVJ_ACCEPT_TIMEOUT_MS ?? 12 * 60 * 1000);
let hardTimeoutId = null;

async function killProcessTree(child) {
  if (!child || typeof child.pid !== 'number') return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

function run(cmd, desc, timeout = 120000) {
  console.log(`\n[TEST] ${desc}`);
  console.log(`[CMD] ${cmd}`);
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd: REPO_ROOT,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf-8');
      process.stdout.write(text);
      output += text;
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    let timeoutId = null;
    if (Number.isFinite(timeout) && timeout > 0) {
      timeoutId = setTimeout(async () => {
        console.error(`[ERROR] ${desc} timed out after ${timeout}ms`);
        await killProcessTree(child);
        RESULTS.push({ desc, status: '❌ 失败', error: 'timeout' });
        resolve(false);
      }, timeout);
    }

    child.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      const errOutput = String(err?.message || output || 'Unknown error');
      console.error(`[ERROR] ${errOutput}`);
      RESULTS.push({ desc, status: '❌ 失败', error: errOutput.substring(0, 200) });
      resolve(false);
    });

    child.on('exit', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (code !== 0) {
        const errOutput = String(output || `Exit code ${code}`);
        console.error(`[ERROR] ${errOutput}`);
        RESULTS.push({ desc, status: '❌ 失败', error: errOutput.substring(0, 200) });
        resolve(false);
        return;
      }
      RESULTS.push({ desc, status: '✅ 通过' });
      resolve(true);
    });
  });
}

function checkFile(path, desc) {
  const exists = existsSync(join(REPO_ROOT, path));
  const status = exists ? '✅' : '❌';
  console.log(`[CHECK] ${desc}: ${status}`);
  RESULTS.push({ desc, status: exists ? '✅ 通过' : '❌ 缺失' });
  return exists;
}

function checkHeadlessArtifacts(desc) {
  const reportPath = join(REPO_ROOT, 'artifacts/headless/report.json');
  const pageErrorPath = join(REPO_ROOT, 'artifacts/headless/page-errors.log');
  if (!existsSync(reportPath)) {
    console.log(`[CHECK] ${desc}: ❌ (report.json missing)`);
    RESULTS.push({ desc, status: '❌ 缺失' });
    return false;
  }

  try {
    const reportRaw = readFileSync(reportPath, 'utf-8');
    const report = JSON.parse(reportRaw);
    const pageErrorsRaw = existsSync(pageErrorPath)
      ? readFileSync(pageErrorPath, 'utf-8')
      : '';
    const pageErrors = pageErrorsRaw.trim().length;

    const framesRendered = report?.checks?.projectMFramesRendered?.framesRendered;
    const framesOk = typeof framesRendered === 'number' && framesRendered >= 3;
    const criticalOk =
      Boolean(report?.checks?.canvasAttached) &&
      framesOk &&
      Boolean(report?.checks?.finalOutputNonEmpty) &&
      Boolean(report?.checks?.finalOutputChanges) &&
      Boolean(report?.checks?.projectMCanvasNonEmpty) &&
      Boolean(report?.checks?.projectMCanvasChanges);

    const ok = pageErrors === 0 && criticalOk;
    console.log(`[CHECK] ${desc}: ${ok ? '✅' : '❌'}`);
    RESULTS.push({ desc, status: ok ? '✅ 通过' : '❌ 失败' });
    return ok;
  } catch (e) {
    console.log(`[CHECK] ${desc}: ❌ (parse failed)`);
    RESULTS.push({ desc, status: '❌ 失败', error: String(e?.message || e) });
    return false;
  }
}

async function main() {
  if (Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0) {
    hardTimeoutId = setTimeout(() => {
      console.error(`[ERROR] Acceptance tests exceeded ${HARD_TIMEOUT_MS}ms, forcing exit.`);
      process.exit(2);
    }, HARD_TIMEOUT_MS);
  }

  console.log('========================================');
  console.log('       AIVJ 优化验收测试套件');
  console.log('========================================');

  // 1. 基础检查
  console.log('\n--- 基础检查 ---');
  checkFile('package.json', 'package.json 存在');
  checkFile('src/app/bootstrap.ts', 'bootstrap.ts 存在');
  checkFile('src/features/aivj/unifiedAivjController.ts', 'AIVJ 控制器存在');
  checkFile('src/features/presets/aivjStyleIndexV0.ts', 'AIVJ StyleIndex 存在');
  checkFile('scripts/aivj/stat-selection-ratio.mjs', '选择比例统计脚本存在');
  checkFile('scripts/aivj/stat-preload-perf.mjs', '预取性能统计脚本存在');
  checkFile('scripts/aivj/stat-frame-time.mjs', 'frame-time 统计脚本存在');
  checkFile('scripts/aivj/verify-budget-dynamics.mjs', '预算动态验证脚本存在');

  // 2. 代码质量检查
  console.log('\n--- 代码质量检查 ---');
  await run('npm run lint', 'TypeScript 编译检查');
  await run('npm run guardrails', '安全检查');

  // 3. 验证测试
  console.log('\n--- 验证测试 ---');
  const useArtifacts = String(process.env.AIVJ_ACCEPT_USE_ARTIFACTS ?? '').trim() === '1';
  if (useArtifacts) {
    checkHeadlessArtifacts('完整验证测试(使用 artifacts)');
  } else {
    await run('npm run verify:dev', '完整验证测试', 180000);
  }

  // 3.1 verify:check（全局门禁，基于 artifacts/headless/report.json + logs/aivj-selection.log）
  await run('npm run verify:check', 'verify:check 全局门禁');

  // 4. AIVJ 选择比例（需要 manifest）
  console.log('\n--- AIVJ 统计脚本 ---');
  if (existsSync(join(REPO_ROOT, 'scripts/aivj/stat-selection-ratio.mjs'))) {
    // 测试脚本能运行（使用模拟数据）
    await run('node scripts/aivj/stat-selection-ratio.mjs', '选择比例统计脚本');
  }

  // 5. 预取性能统计（需要日志）
  if (existsSync(join(REPO_ROOT, 'scripts/aivj/stat-preload-perf.mjs'))) {
    await run(
      'node scripts/aivj/stat-preload-perf.mjs --gate=0',
      '预取/卡顿统计脚本(信息模式)',
    );
  }

  // 5.1 frame-time 统计（落盘证据，不做严格门禁）
  if (existsSync(join(REPO_ROOT, 'scripts/aivj/stat-frame-time.mjs'))) {
    await run(
      'node scripts/aivj/stat-frame-time.mjs --log=logs/preload.log --json=artifacts/headless/frame-time.json',
      'frame-time 统计(证据落盘)',
    );
  }

  // 6. 数据链路验证
  console.log('\n--- 数据链路验证 ---');
  if (existsSync(join(REPO_ROOT, 'scripts/aivj/verify-datalink.mjs'))) {
    await run('node scripts/aivj/verify-datalink.mjs', '数据链路风险验证');
  } else {
    console.log('[SKIP] verify-datalink.mjs 不存在');
  }

  // 7. 预算动态验证（依赖 verify:dev artifacts + preload.log）
  console.log('\n--- 预算动态验证 ---');
  if (existsSync(join(REPO_ROOT, 'scripts/aivj/verify-budget-dynamics.mjs'))) {
    await run('node scripts/aivj/verify-budget-dynamics.mjs', '预算动态验证脚本');
  } else {
    console.log('[SKIP] verify-budget-dynamics.mjs 不存在');
  }

  // 输出汇总
  console.log('\n========================================');
  console.log('               测试汇总');
  console.log('========================================');
  RESULTS.forEach(r => console.log(`${r.status} ${r.desc}`));
  const passed = RESULTS.filter(r => r.status === '✅ 通过').length;
  const total = RESULTS.length;
  const percent = total > 0 ? (passed / total * 100).toFixed(1) : 0;
  console.log(`\n通过率：${passed}/${total} (${percent}%)`);

  // 分类统计
  const checks = RESULTS.filter(r => r.desc.includes('存在') || r.desc.includes('检查'));
  const tests = RESULTS.filter(r => !r.desc.includes('存在') && !r.desc.includes('检查'));
  const checksPass = checks.filter(r => r.status === '✅ 通过').length;
  const testsPass = tests.filter(r => r.status === '✅ 通过').length;

  console.log(`\n基础检查：${checksPass}/${checks.length} 通过`);
  console.log(`功能测试：${testsPass}/${tests.length} 通过`);

  if (passed === total) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log(`\n⚠️ 有 ${total - passed} 项未通过，请检查上方日志`);
  }

  // Make this script usable as a real gate in CI / automation.
  // Non-zero exit when any check/test did not pass.
  if (passed !== total) {
    process.exitCode = 2;
  }

  if (hardTimeoutId) clearTimeout(hardTimeoutId);
}

try {
  await main();
  if (process.exitCode == null) process.exitCode = 0;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
