import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5174/";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      console.log(`[console.${type}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${String(err?.stack || err)}`);
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    console.log(`[requestfailed] ${req.method()} ${req.url()} :: ${failure?.errorText ?? "unknown"}`);
  });

  await page.goto(url, { waitUntil: "networkidle" });
  try {
    await page.waitForFunction(() => Boolean((window /** @type {any} */).__nw_verify), null, {
      timeout: 10000,
    });
  } catch {
    // ignore
  }
  const info = await page.evaluate(() => {
    const root = (window /** @type {any} */).__nw_verify;
    return {
      has: Boolean(root),
      getPerfCapsType: root ? typeof root.getPerfCaps : "missing",
      keys: root ? Object.keys(root).sort() : [],
    };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
