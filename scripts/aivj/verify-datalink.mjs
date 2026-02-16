#!/usr/bin/env node
/**
 * 验证数据链路风险
 * 检查：D:\aidata 路径、manifest 缓存、CORS 失败回退
 * 用法：node scripts/aivj/verify-datalink.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

function check(name, condition, desc) {
  const status = condition ? '✅' : '❌';
  console.log(`${status} ${name}`);
  console.log(`    ${desc}`);
  return condition;
}

function main() {
  console.log('=== 数据链路风险验证 ===\n');
  const results = [];

  // 1. D:\aidata 路径检查
  console.log('--- 炼丹产物路径 ---');
  const aidataPaths = [
    { win: 'D:\\aidata', desc: 'Windows 路径' },
    { win: 'D:/aidata', desc: 'Windows 路径 (正斜杠)' },
  ];

  let aidataExists = false;
  for (const p of aidataPaths) {
    if (existsSync(p.win)) {
      aidataExists = true;
      check(`D:\\aidata 可访问`, true, `路径：${p.win}`);
      break;
    }
  }
  if (!aidataExists) {
    check(`D:\\aidata 可访问`, false, '路径：D:\\aidata (不存在)');
  }

  // 2. WSL 路径映射
  const wslPath = '/mnt/d/aidata';
  check(
    'WSL 路径可访问',
    existsSync(wslPath),
    `路径：${wslPath}`
  );

  // 3. Manifest 缓存策略
  console.log('\n--- Manifest 缓存策略 ---');
  const bootstrapPath = join(REPO_ROOT, 'src/app/bootstrap.ts');
  if (existsSync(bootstrapPath)) {
    const bootstrap = readFileSync(bootstrapPath, 'utf-8');
    const hasLocalStorage = bootstrap.includes('localStorage');
    const hasCache = bootstrap.includes('cache') || bootstrap.includes('Cache');
    const hasReturnNull = bootstrap.includes('return null') || bootstrap.includes('keeping existing');

    check(
      'Manifest 缓存逻辑',
      hasLocalStorage && hasCache,
      hasLocalStorage && hasCache ? 'localStorage + cache 机制存在' : '缺少缓存逻辑'
    );

    results.push({ item: 'Manifest 缓存', pass: hasLocalStorage && hasCache });
  } else {
    check('bootstrap.ts 存在', false, '文件不存在');
  }

  // 4. CORS 配置
  console.log('\n--- CORS 配置 ---');
  const dashboardPath = join(REPO_ROOT, 'scripts/aivj/dashboard-server.mjs');
  if (existsSync(dashboardPath)) {
    const dashboard = readFileSync(dashboardPath, 'utf-8');
    const hasCors = dashboard.toLowerCase().includes('cors');

    check(
      'Dashboard CORS 配置',
      hasCors,
      hasCors ? 'CORS 中间件已配置' : '缺少 CORS 配置'
    );

    results.push({ item: 'CORS 配置', pass: hasCors });
  } else {
    check('dashboard-server.mjs 存在', false, '文件不存在');
  }

  // 5. 失败回退机制
  console.log('\n--- 失败回退机制 ---');
  if (existsSync(bootstrapPath)) {
    const bootstrap = readFileSync(bootstrapPath, 'utf-8');
    const hasKeepExisting = bootstrap.includes('keep existing') || bootstrap.includes('keeping existing');
    const hasReturnNullFallback = bootstrap.includes('return null');

    check(
      'Manifest 拉取失败回退',
      hasKeepExisting || hasReturnNullFallback,
      hasKeepExisting || hasReturnNullFallback
        ? '失败时保留旧数据或返回 null'
        : '缺少回退机制'
    );

    results.push({ item: '失败回退', pass: hasKeepExisting || hasReturnNullFallback });
  }

  // 6. runManifestLoader 检查
  console.log('\n--- runManifestLoader 检查 ---');
  const loaderPath = join(REPO_ROOT, 'src/features/presets/runManifestLoader.ts');
  if (existsSync(loaderPath)) {
    const loader = readFileSync(loaderPath, 'utf-8');
    const hasFetch = loader.includes('fetch(');
    const hasCatch = loader.includes('catch') || loader.includes('try');

    check(
      'Loader fetch 实现',
      hasFetch,
      hasFetch ? '使用 fetch API' : '未使用 fetch'
    );

    check(
      'Loader 错误处理',
      hasCatch,
      hasCatch ? 'try-catch 错误处理' : '缺少错误处理'
    );

    results.push({ item: 'Loader fetch', pass: hasFetch });
    results.push({ item: 'Loader 错误处理', pass: hasCatch });
  } else {
    check('runManifestLoader.ts 存在', false, '文件不存在');
  }

  // 7. 硬失败过滤检查
  console.log('\n--- 硬失败过滤 ---');
  const storePath = join(REPO_ROOT, 'src/features/presets/runManifestStore.ts');
  if (existsSync(storePath)) {
    const store = readFileSync(storePath, 'utf-8');
    const hasHardFailTokens = store.includes('HARD_FAIL_TOKENS');
    const hasIsAllowedFn = store.includes('isPresetAllowedByManifest');

    check(
      'HARD_FAIL_TOKENS 定义',
      hasHardFailTokens,
      hasHardFailTokens ? '硬失败 token 已定义' : '缺少硬失败定义'
    );

    check(
      'isPresetAllowedByManifest 函数',
      hasIsAllowedFn,
      hasIsAllowedFn ? '过滤函数已实现' : '缺少过滤函数'
    );

    results.push({ item: '硬失败过滤', pass: hasHardFailTokens && hasIsAllowedFn });
  } else {
    check('runManifestStore.ts 存在', false, '文件不存在');
  }

  // 8. 汇总
  console.log('\n========================================');
  console.log('               验证汇总');
  console.log('========================================');

  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  console.log(`通过：${passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 所有数据链路检查通过！');
  } else {
    console.log('\n⚠️ 以下项目需要关注：');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ ${r.item}`);
    });
  }

  console.log('\n--- 用法 ---');
  console.log('  # 运行验证');
  console.log('  node scripts/aivj/verify-datalink.mjs');
  console.log('');
  console.log('--- 已知风险 ---');
  console.log('  1. D:\\aidata 路径仅在 Windows 可访问');
  console.log('  2. WSL 下需要确保 /mnt/d/aidata 正确挂载');
  console.log('  3. CORS 依赖 dashboard-server.mjs 的配置');
  console.log('  4. 离线时 manifest 拉取会失败，需有回退');

  return { passed, total, results };
}

Promise.resolve()
  .then(() => main())
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
  });
