/**
 * 生产构建验证脚本
 * 
 * 功能:
 * 1. 执行生产构建 (npm run build)
 * 2. 启动预览服务器 (npm run preview)
 * 3. 执行无头浏览器验证
 * 
 * 使用方法:
 *   node scripts/verify-production.mjs
 * 
 * 环境变量:
 *   VERIFY_TIMEOUT - 验证超时时间（默认 300000ms = 5分钟）
 *   BUILD_DIR - 构建输出目录（默认 dist）
 *   PREVIEW_PORT - 预览服务器端口（默认 4173）
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts', 'verify-production');
const BUILD_DIR = process.env.BUILD_DIR || 'dist';
const PREVIEW_PORT = process.env.PREVIEW_PORT || '4173';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// 检查端口是否可用
async function waitForPort(port, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.status !== 0) {
        return true;
      }
    } catch {
      // 继续等待
    }
    await sleep(500);
  }
  return false;
}

// 执行生产构建
async function buildProduction() {
  log('\n[1/4] 执行生产构建...', 'cyan');
  
  try {
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
    });
    log('生产构建完成！', 'green');
    return true;
  } catch (err) {
    log('生产构建失败！', 'red');
    return false;
  }
}

// 启动预览服务器
function startPreviewServer() {
  log('\n[2/4] 启动预览服务器...', 'cyan');
  
  const previewProcess = spawn('npm', ['run', 'preview'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: true,
    windowsHide: true,
    env: {
      ...process.env,
      PREVIEW_PORT,
    },
  });

  let serverReady = false;
  
  previewProcess.stdout.on('data', (data) => {
    const text = data.toString();
    if (text.includes('Local:') || text.includes(PREVIEW_PORT)) {
      serverReady = true;
    }
    if (text.includes('error') || text.includes('Error')) {
      log(`[PREVIEW] ${text.trim()}`, 'red');
    }
  });

  previewProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text && !text.includes('WARN')) {
      log(`[PREVIEW ERROR] ${text}`, 'red');
    }
  });

  return { process: previewProcess, ready: () => serverReady };
}

// 运行无头验证
async function runHeadlessVerification() {
  log('\n[3/4] 执行无头浏览器验证...', 'cyan');
  log('这可能需要 2-5 分钟，请耐心等待...', 'yellow');
  
  return new Promise((resolve, reject) => {
    const verifyProcess = spawn('npx', ['playwright', 'test', '--reporter=list'], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        VERIFY_URL: `http://127.0.0.1:${PREVIEW_PORT}/`,
        VERIFY_OUT_DIR: ARTIFACTS_DIR,
        VERIFY_DSF: '1.5',
        VERIFY_HARD_TIMEOUT_MS: process.env.VERIFY_TIMEOUT || '300000',
        VERIFY_PRESET_LIBRARY: 'run3-crashsafe-15000',
      },
    });

    let output = '';

    verifyProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    verifyProcess.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data.toString());
    });

    verifyProcess.on('close', (code) => {
      resolve({
        exitCode: code,
        output,
      });
    });

    verifyProcess.on('error', reject);
  });
}

// 运行新功能验证
async function runNewFeaturesVerification() {
  log('\n[4/4] 执行新功能验证...', 'cyan');
  
  return new Promise((resolve, reject) => {
    const verifyProcess = spawn('node', ['scripts/verify-new-features.mjs'], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        VERIFY_OUT_DIR: path.join(ARTIFACTS_DIR, 'new-features'),
        VERIFY_URL: `http://127.0.0.1:${PREVIEW_PORT}/`,
        API_URL: 'http://localhost:5000',
      },
    });

    let output = '';

    verifyProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    verifyProcess.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data.toString());
    });

    verifyProcess.on('close', (code) => {
      resolve({
        exitCode: code,
        output,
      });
    });

    verifyProcess.on('error', reject);
  });
}

// 生成报告
async function generateReport(results) {
  log('\n' + '='.repeat(60), 'bright');
  log('生成验证报告...', 'bright');
  log('='.repeat(60), 'bright');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      buildSuccess: results.build,
      previewServerStarted: results.previewServer,
      headlessVerify: results.headless.exitCode === 0 ? 'PASS' : 'FAIL',
      newFeaturesVerify: results.newFeatures.exitCode === 0 ? 'PASS' : 'FAIL',
    },
    config: {
      buildDir: BUILD_DIR,
      previewPort: PREVIEW_PORT,
      artifactsDir: ARTIFACTS_DIR,
    },
  };

  const reportPath = path.join(ARTIFACTS_DIR, 'production-verification-summary.json');
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return report;
}

// 打印摘要
function printSummary(report) {
  log('\n' + '='.repeat(60), 'bright');
  log('生产构建验证完成摘要', 'bright');
  log('='.repeat(60), 'bright');

  const { summary } = report;
  
  log(`\n生产构建: ${summary.buildSuccess ? '✅ 成功' : '❌ 失败'}`);
  log(`预览服务器: ${summary.previewServerStarted ? '✅ 启动成功' : '❌ 启动失败'}`);
  log(`无头验证: ${summary.headlessVerify === 'PASS' ? '✅ 通过' : '⚠️ 部分失败'}`);
  log(`新功能验证: ${summary.newFeaturesVerify === 'PASS' ? '✅ 通过' : '⚠️ 部分失败'}`);

  log('\n验证产物:', 'bright');
  log(`  目录: ${ARTIFACTS_DIR}`);
  log(`  报告: ${path.join(ARTIFACTS_DIR, 'production-verification-summary.json')}`);

  log('\n' + '='.repeat(60), 'bright');
}

// 主函数
async function main() {
  log('='.repeat(60), 'bright');
  log('NewLiveWeb 生产构建验证', 'bright');
  log('='.repeat(60), 'bright');
  log(`构建目录: ${BUILD_DIR}`, 'cyan');
  log(`预览端口: ${PREVIEW_PORT}`, 'cyan');

  const results = {
    build: false,
    previewServer: false,
    headless: { exitCode: -1 },
    newFeatures: { exitCode: -1 },
  };

  // 1. 执行生产构建
  results.build = await buildProduction();
  if (!results.build) {
    log('构建失败，退出验证', 'red');
    process.exit(1);
  }

  // 2. 启动预览服务器
  const previewServer = startPreviewServer();
  
  log('等待预览服务器就绪 (最多 60 秒)...', 'yellow');
  const portReady = await waitForPort(PREVIEW_PORT, 60000);
  
  if (!portReady) {
    log('预览服务器启动超时！', 'red');
    previewServer.process.kill();
    process.exit(1);
  }
  
  results.previewServer = true;
  log('预览服务器就绪！', 'green');

  // 额外等待确保完全加载
  await sleep(3000);

  // 3. 执行无头验证
  try {
    results.headless = await runHeadlessVerification();
  } catch (err) {
    log(`无头验证执行错误: ${err.message}`, 'red');
    results.headless = { exitCode: -1, error: err.message };
  }

  // 4. 执行新功能验证
  try {
    results.newFeatures = await runNewFeaturesVerification();
  } catch (err) {
    log(`新功能验证执行错误: ${err.message}`, 'red');
    results.newFeatures = { exitCode: -1, error: err.message };
  }

  // 5. 生成报告
  const report = await generateReport(results);
  printSummary(report);

  // 6. 清理
  log('\n清理进程...', 'cyan');
  previewServer.process.kill();

  // 返回退出码
  const hasErrors = results.headless.exitCode !== 0 || results.newFeatures.exitCode !== 0;
  process.exit(hasErrors ? 1 : 0);
}

// 错误处理
process.on('unhandledRejection', (err) => {
  log(`\n未处理的错误: ${err.message}`, 'red');
  process.exit(1);
});

process.on('SIGINT', () => {
  log('\n用户中断验证', 'yellow');
  process.exit(130);
});

main();
