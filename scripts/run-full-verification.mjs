/**
 * 完整验证脚本 - 启动开发服务器并执行无头浏览器验证
 * 
 * 使用方法:
 *   node scripts/run-full-verification.mjs
 * 
 * 环境变量:
 *   VERIFY_TIMEOUT - 验证超时时间（默认 300000ms = 5分钟）
 *   VERIFY_DSF - 设备缩放因子（默认 1.5）
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts', 'full-verification');

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
async function checkPort(port, timeout = 60000) {
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

// 启动开发服务器
function startDevServer() {
  log('\n[1/4] 启动 Vite 开发服务器...', 'cyan');
  
  const devProcess = spawn('npm', ['run', 'dev'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: true,
    windowsHide: true,
  });

  let serverReady = false;
  
  devProcess.stdout.on('data', (data) => {
    const text = data.toString();
    // Vite 启动完成标志
    if (text.includes('Local:') || text.includes('5174')) {
      serverReady = true;
    }
    // 只输出关键信息
    if (text.includes('error') || text.includes('Error')) {
      log(`[DEV] ${text.trim()}`, 'red');
    }
  });

  devProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text && !text.includes('WARN')) {
      log(`[DEV ERROR] ${text}`, 'red');
    }
  });

  devProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log(`[DEV] 服务器异常退出，代码: ${code}`, 'red');
    }
  });

  return { process: devProcess, ready: () => serverReady };
}

// 启动 API 服务器
function startAPIServer() {
  log('\n[2/4] 启动 Python API 服务器...', 'cyan');
  
  const apiProcess = spawn(
    path.join(ROOT_DIR, 'python', 'preset_analyzer', 'venv', 'Scripts', 'python.exe'),
    ['api_server.py'],
    {
      cwd: path.join(ROOT_DIR, 'python', 'preset_analyzer'),
      stdio: 'pipe',
      windowsHide: true,
    }
  );

  let apiReady = false;
  
  apiProcess.stdout.on('data', (data) => {
    const text = data.toString();
    if (text.includes('Running on') || text.includes('5000')) {
      apiReady = true;
    }
  });

  apiProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text && !text.includes('WARNING')) {
      log(`[API ERROR] ${text}`, 'red');
    }
  });

  return { process: apiProcess, ready: () => apiReady };
}

// 运行验证
async function runVerification() {
  log('\n[3/4] 执行无头浏览器验证...', 'cyan');
  log('这可能需要 2-5 分钟，请耐心等待...', 'yellow');
  
  return new Promise((resolve, reject) => {
    const verifyProcess = spawn('npm', ['run', 'verify:headless'], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        VERIFY_OUT_DIR: ARTIFACTS_DIR,
        VERIFY_DSF: process.env.VERIFY_DSF || '1.5',
        VERIFY_HARD_TIMEOUT_MS: process.env.VERIFY_TIMEOUT || '300000',
      },
    });

    let output = '';
    let errorOutput = '';

    verifyProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // 实时输出关键信息
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('✓') || line.includes('PASS')) {
          log(line, 'green');
        } else if (line.includes('✗') || line.includes('FAIL') || line.includes('error')) {
          log(line, 'red');
        } else if (line.includes('verify') || line.includes('Test')) {
          log(line, 'cyan');
        }
      }
    });

    verifyProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    verifyProcess.on('close', (code) => {
      resolve({
        exitCode: code,
        output,
        errorOutput,
      });
    });

    verifyProcess.on('error', (err) => {
      reject(err);
    });
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
        VERIFY_URL: 'http://127.0.0.1:5174/',
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

// 收集和生成报告
async function generateReport(results) {
  log('\n' + '='.repeat(60), 'bright');
  log('生成验证报告...', 'bright');
  log('='.repeat(60), 'bright');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      devServerStarted: results.devServer,
      apiServerStarted: results.apiServer,
      headlessVerify: results.headless.exitCode === 0 ? 'PASS' : 'FAIL',
      newFeaturesVerify: results.newFeatures.exitCode === 0 ? 'PASS' : 'FAIL',
    },
    details: {
      headless: {
        exitCode: results.headless.exitCode,
        artifactsDir: ARTIFACTS_DIR,
      },
      newFeatures: {
        exitCode: results.newFeatures.exitCode,
        output: results.newFeatures.output,
      },
    },
  };

  // 尝试读取 headless 验证的详细报告
  try {
    const headlessReportPath = path.join(ARTIFACTS_DIR, 'report.json');
    const headlessReport = JSON.parse(await fs.readFile(headlessReportPath, 'utf8'));
    report.details.headless.checks = headlessReport.checks;
    report.details.headless.counts = headlessReport.counts;
  } catch {
    log('警告: 无法读取 headless 验证详细报告', 'yellow');
  }

  // 保存汇总报告
  const reportPath = path.join(ARTIFACTS_DIR, 'verification-summary.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return report;
}

// 打印最终摘要
function printSummary(report) {
  log('\n' + '='.repeat(60), 'bright');
  log('验证完成摘要', 'bright');
  log('='.repeat(60), 'bright');

  const { summary } = report;
  
  log(`\n开发服务器: ${summary.devServerStarted ? '✅ 启动成功' : '❌ 启动失败'}`);
  log(`API 服务器: ${summary.apiServerStarted ? '✅ 启动成功' : '❌ 启动失败'}`);
  log(`无头验证: ${summary.headlessVerify === 'PASS' ? '✅ 通过' : '⚠️ 部分失败'}`);
  log(`新功能验证: ${summary.newFeaturesVerify === 'PASS' ? '✅ 通过' : '⚠️ 部分失败'}`);

  // 详细的检查结果
  if (report.details.headless.checks) {
    log('\n详细检查结果:', 'bright');
    const checks = report.details.headless.checks;
    for (const [key, value] of Object.entries(checks)) {
      if (typeof value === 'boolean') {
        log(`  ${value ? '✅' : '❌'} ${key}`, value ? 'green' : 'red');
      } else if (value && typeof value === 'object') {
        const ok = value.ok ?? value.ok === undefined;
        log(`  ${ok !== false ? '✅' : '❌'} ${key}: ${JSON.stringify(value).substring(0, 60)}...`);
      }
    }
  }

  // 错误统计
  if (report.details.headless.counts) {
    const { console: consoleCount, pageErrors } = report.details.headless.counts;
    log(`\n控制台消息: ${consoleCount} 条`);
    log(`页面错误: ${pageErrors} 个`, pageErrors > 0 ? 'yellow' : 'reset');
  }

  // 产物位置
  log('\n验证产物:', 'bright');
  log(`  截图: ${path.join(ARTIFACTS_DIR, 'screenshot.png')}`);
  log(`  控制台日志: ${path.join(ARTIFACTS_DIR, 'browser-console.log')}`);
  log(`  页面错误: ${path.join(ARTIFACTS_DIR, 'page-errors.log')}`);
  log(`  报告: ${path.join(ARTIFACTS_DIR, 'report.json')}`);
  log(`  汇总报告: ${path.join(ARTIFACTS_DIR, 'verification-summary.json')}`);

  log('\n' + '='.repeat(60), 'bright');
}

// 主函数
async function main() {
  log('='.repeat(60), 'bright');
  log('NewLiveWeb 完整验证流程', 'bright');
  log('='.repeat(60), 'bright');

  const results = {
    devServer: false,
    apiServer: false,
    headless: { exitCode: -1 },
    newFeatures: { exitCode: -1 },
  };

  // 确保产物目录存在
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  // 1. 启动开发服务器
  const devServer = startDevServer();
  
  // 等待服务器就绪
  log('等待开发服务器就绪 (最多 60 秒)...', 'yellow');
  let waitTime = 0;
  while (waitTime < 60000) {
    if (devServer.ready()) {
      results.devServer = true;
      break;
    }
    // 尝试连接端口
    try {
      await fetch('http://127.0.0.1:5174');
      results.devServer = true;
      break;
    } catch {
      // 继续等待
    }
    await sleep(1000);
    waitTime += 1000;
    process.stdout.write('.');
  }
  console.log('');

  if (!results.devServer) {
    log('开发服务器启动超时！', 'red');
    devServer.process.kill();
    process.exit(1);
  }
  log('开发服务器就绪！', 'green');

  // 额外等待确保完全加载
  log('等待 3 秒确保服务器完全加载...', 'yellow');
  await sleep(3000);

  // 2. 启动 API 服务器（可选）
  let apiServer;
  try {
    apiServer = startAPIServer();
    log('等待 API 服务器就绪...', 'yellow');
    await sleep(3000);
    // 测试 API
    const apiResponse = await fetch('http://localhost:5000/health');
    if (apiResponse.ok) {
      results.apiServer = true;
      log('API 服务器就绪！', 'green');
    }
  } catch (err) {
    log('API 服务器启动失败，继续执行其他验证...', 'yellow');
  }

  // 3. 执行无头浏览器验证
  try {
    results.headless = await runVerification();
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
  devServer.process.kill();
  if (apiServer) {
    apiServer.process.kill();
  }

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
