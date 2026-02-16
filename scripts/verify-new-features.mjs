/**
 * 新功能无头浏览器验证脚本
 * 
 * 验证内容:
 * 1. WASM HNSW 模块加载
 * 2. Python Preset Analyzer API
 * 3. 核心模块间通讯
 * 
 * 使用方法:
 *   node scripts/verify-new-features.mjs
 * 
 * 环境变量:
 *   VERIFY_URL - 目标 URL (默认: http://127.0.0.1:5174/)
 *   API_URL    - Preset Analyzer API URL (默认: http://localhost:5000)
 *   VERIFY_OUT_DIR - 输出目录 (默认: artifacts/verify-new-features)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.VERIFY_URL ?? 'http://127.0.0.1:5174/';
const API_URL = process.env.API_URL ?? 'http://localhost:5000';
const OUT_DIR = process.env.VERIFY_OUT_DIR ?? path.resolve('artifacts', 'verify-new-features');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ============================================================================
// API 测试
// ============================================================================

async function testPresetAnalyzerAPI() {
  console.log('[API] Testing Preset Analyzer API...');
  const results = {
    health: { ok: false, data: null, error: null },
    info: { ok: false, data: null, error: null },
  };

  try {
    // Test health endpoint
    const healthRes = await fetch(`${API_URL}/health`);
    results.health.ok = healthRes.ok;
    if (healthRes.ok) {
      results.health.data = await healthRes.json();
    }
  } catch (err) {
    results.health.error = String(err?.message || err);
  }

  try {
    // Test info endpoint
    const infoRes = await fetch(`${API_URL}/info`);
    results.info.ok = infoRes.ok;
    if (infoRes.ok) {
      results.info.data = await infoRes.json();
    }
  } catch (err) {
    results.info.error = String(err?.message || err);
  }

  console.log(`[API] Health: ${results.health.ok ? 'OK' : 'FAIL'}`);
  console.log(`[API] Info: ${results.info.ok ? 'OK' : 'FAIL'}`);

  return results;
}

// ============================================================================
// 浏览器测试
// ============================================================================

async function testBrowserFeatures() {
  console.log('[Browser] Starting browser tests...');
  
  await ensureDir(OUT_DIR);
  
  const report = {
    url: BASE_URL,
    startedAt: new Date().toISOString(),
    checks: {
      wasmModuleLoaded: false,
      wasmHNSWWorking: false,
      audioModulesLoaded: false,
      meydaAudioAnalyzer: false,
      essentiaTransientDetector: false,
      presetModulesLoaded: false,
      banditRecommender: false,
      reactivePresetSwitcher: false,
      similaritySearch: false,
      utilsModulesLoaded: false,
      errorBoundary: false,
      performanceMonitor: false,
    },
    console: [],
    errors: [],
  };

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Capture console messages
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    report.console.push(text);
    if (msg.type() === 'error') {
      report.errors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    report.errors.push(String(err?.stack || err));
  });

  try {
    // Navigate to the app
    console.log(`[Browser] Navigating to ${BASE_URL}...`);
    const resp = await page.goto(BASE_URL, { 
      waitUntil: 'networkidle', 
      timeout: 120_000  // 2 minutes for initial load
    });
    
    if (!resp || !resp.ok()) {
      throw new Error(`Failed to load page: ${resp?.status()} ${resp?.statusText()}`);
    }

    // Wait for app to initialize (Vite first load can be slow)
    await sleep(10000);

    // Test 1: WASM Module Loading
    console.log('[Browser] Testing WASM module...');
    const wasmStatus = await page.evaluate(async () => {
      const results = {
        wasmSupported: false,
        hnswLoaded: false,
        hnswWorking: false,
        error: null,
      };

      try {
        // Check WebAssembly support
        results.wasmSupported = typeof WebAssembly === 'object' && 
                               typeof WebAssembly.instantiate === 'function';

        if (results.wasmSupported) {
          // Try to load the WASM module
          try {
            const wasmModule = await import('/vendor/wasm/hnsw_wasm.js');
            
            // Initialize the WASM module first
            if (wasmModule.default) {
              await wasmModule.default();
            }
            
            results.hnswLoaded = true;

            // Test basic functionality
            if (wasmModule.HNSWIndex) {
              const index = new wasmModule.HNSWIndex(128, 1000);
              index.add_item(1, new Float32Array(128).fill(0.1));
              const searchResult = index.search(new Float32Array(128).fill(0.1), 5);
              results.hnswWorking = searchResult !== null && searchResult.length > 0;
            } else {
              results.error = 'HNSWIndex not found in module';
            }
          } catch (e) {
            results.error = String(e?.message || e);
          }
        }
      } catch (e) {
        results.error = String(e?.message || e);
      }

      return results;
    });

    report.checks.wasmModuleLoaded = wasmStatus.wasmSupported && wasmStatus.hnswLoaded;
    report.checks.wasmHNSWWorking = wasmStatus.hnswWorking;
    console.log(`[Browser] WASM supported: ${wasmStatus.wasmSupported}`);
    console.log(`[Browser] HNSW loaded: ${wasmStatus.hnswLoaded}`);
    console.log(`[Browser] HNSW working: ${wasmStatus.hnswWorking}`);
    if (wasmStatus.error) {
      console.log(`[Browser] WASM error: ${wasmStatus.error}`);
    }

    // Test 2: Audio Modules
    console.log('[Browser] Testing audio modules...');
    const audioStatus = await page.evaluate(() => {
      const results = {
        meydaLoaded: false,
        essentiaLoaded: false,
        audioBusOptimized: false,
      };

      // Check if audio modules are available
      if (window.__nw_verify?.getPerfCaps) {
        const caps = window.__nw_verify.getPerfCaps();
        results.meydaLoaded = caps?.audioAnalysisFpsCap > 0;
        results.essentiaLoaded = typeof window.Essentia !== 'undefined' || 
                                 document.querySelector('script[src*="essentia"]') !== null;
      }

      // Check AudioBusOptimized
      results.audioBusOptimized = typeof window.AudioBus !== 'undefined' ||
                                  document.querySelector('[data-audio-bus]') !== null;

      return results;
    });

    report.checks.audioModulesLoaded = audioStatus.meydaLoaded || audioStatus.audioBusOptimized;
    report.checks.meydaAudioAnalyzer = audioStatus.meydaLoaded;
    report.checks.essentiaTransientDetector = audioStatus.essentiaLoaded;
    console.log(`[Browser] Meyda loaded: ${audioStatus.meydaLoaded}`);
    console.log(`[Browser] Essentia loaded: ${audioStatus.essentiaLoaded}`);
    console.log(`[Browser] AudioBus optimized: ${audioStatus.audioBusOptimized}`);

    // Test 3: Preset Modules
    console.log('[Browser] Testing preset modules...');
    const presetStatus = await page.evaluate(() => {
      const results = {
        banditRecommender: false,
        reactivePresetSwitcher: false,
        similaritySearch: false,
      };

      // Check for BanditRecommender
      results.banditRecommender = typeof window.BanditRecommender !== 'undefined' ||
                                  !!document.querySelector('[data-bandit]');

      // Check for ReactivePresetSwitcher
      results.reactivePresetSwitcher = typeof window.ReactivePresetSwitcher !== 'undefined' ||
                                       !!document.querySelector('[data-reactive-switcher]');

      // Check for similarity search
      results.similaritySearch = !!window.__nw_verify?.actions?.findSimilarPresets ||
                                 !!document.querySelector('[data-similarity-search]');

      return results;
    });

    report.checks.presetModulesLoaded = presetStatus.banditRecommender || 
                                        presetStatus.reactivePresetSwitcher ||
                                        presetStatus.similaritySearch;
    report.checks.banditRecommender = presetStatus.banditRecommender;
    report.checks.reactivePresetSwitcher = presetStatus.reactivePresetSwitcher;
    report.checks.similaritySearch = presetStatus.similaritySearch;
    console.log(`[Browser] Bandit Recommender: ${presetStatus.banditRecommender}`);
    console.log(`[Browser] Reactive Preset Switcher: ${presetStatus.reactivePresetSwitcher}`);
    console.log(`[Browser] Similarity Search: ${presetStatus.similaritySearch}`);

    // Test 4: Utils Modules
    console.log('[Browser] Testing utils modules...');
    const utilsStatus = await page.evaluate(() => {
      const results = {
        errorBoundary: false,
        performanceMonitor: false,
      };

      // Check ErrorBoundary
      results.errorBoundary = typeof window.ErrorBoundary !== 'undefined' ||
                              !!window.__nw_verify?.errorBoundary;

      // Check PerformanceMonitor
      results.performanceMonitor = typeof window.PerformanceMonitor !== 'undefined' ||
                                   !!window.__nw_verify?.getPerfCaps;

      return results;
    });

    report.checks.utilsModulesLoaded = utilsStatus.errorBoundary || utilsStatus.performanceMonitor;
    report.checks.errorBoundary = utilsStatus.errorBoundary;
    report.checks.performanceMonitor = utilsStatus.performanceMonitor;
    console.log(`[Browser] Error Boundary: ${utilsStatus.errorBoundary}`);
    console.log(`[Browser] Performance Monitor: ${utilsStatus.performanceMonitor}`);

    // Take screenshot
    const screenshotPath = path.join(OUT_DIR, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[Browser] Screenshot saved: ${screenshotPath}`);

  } catch (err) {
    console.error('[Browser] Error during tests:', err);
    report.errors.push(String(err?.stack || err));
  } finally {
    await browser.close();
  }

  report.endedAt = new Date().toISOString();
  
  // Calculate summary
  const checks = Object.values(report.checks);
  report.summary = {
    total: checks.length,
    passed: checks.filter(Boolean).length,
    failed: checks.filter(c => !Boolean(c)).length,
  };

  return report;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('New Features Verification Script');
    console.log('');
    console.log('Environment variables:');
    console.log('  VERIFY_URL     - Target URL (default: http://127.0.0.1:5174/)');
    console.log('  API_URL        - Preset Analyzer API URL (default: http://localhost:5000)');
    console.log('  VERIFY_OUT_DIR - Output directory (default: artifacts/verify-new-features)');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/verify-new-features.mjs');
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('New Features Verification');
  console.log('='.repeat(60));
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Output Dir: ${OUT_DIR}`);
  console.log('');

  const fullReport = {
    startedAt: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      apiUrl: API_URL,
      outDir: OUT_DIR,
    },
    apiTests: null,
    browserTests: null,
  };

  // Run API tests
  try {
    fullReport.apiTests = await testPresetAnalyzerAPI();
  } catch (err) {
    console.error('[API] Fatal error:', err);
    fullReport.apiTests = { error: String(err) };
  }

  console.log('');

  // Run browser tests
  try {
    fullReport.browserTests = await testBrowserFeatures();
  } catch (err) {
    console.error('[Browser] Fatal error:', err);
    fullReport.browserTests = { error: String(err) };
  }

  fullReport.endedAt = new Date().toISOString();

  // Save report
  await ensureDir(OUT_DIR);
  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeJson(reportPath, fullReport);

  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));

  if (fullReport.apiTests) {
    const api = fullReport.apiTests;
    console.log(`API Health: ${api.health?.ok ? '✅' : '❌'}`);
    console.log(`API Info: ${api.info?.ok ? '✅' : '❌'}`);
  }

  if (fullReport.browserTests?.summary) {
    const { total, passed, failed } = fullReport.browserTests.summary;
    console.log(`Browser Tests: ${passed}/${total} passed`);
    if (failed > 0) {
      console.log(`Failed checks:`);
      for (const [key, value] of Object.entries(fullReport.browserTests.checks)) {
        if (!value) {
          console.log(`  ❌ ${key}`);
        }
      }
    }
  }

  console.log('');
  console.log(`Full report saved to: ${reportPath}`);
  console.log('='.repeat(60));

  // Exit with appropriate code
  const hasErrors = fullReport.browserTests?.summary?.failed > 0 ||
                   !fullReport.apiTests?.health?.ok;
  process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
