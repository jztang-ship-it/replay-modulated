import { chromium } from "playwright";

const BASE = "http://localhost:5173/basketball/dev/h2h-reveal-mock";

async function getOverlayPresence(url, debug) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.error(`[pageerror]`, e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[console.${msg.type()}]`, msg.text());
    }
  });
  await page.goto(debug ? `${url}?relayDebug=1` : url, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  // Settle for any layout.
  await page.waitForTimeout(2500);
  const present = await page.evaluate(() =>
    document.querySelectorAll("[data-h2h-relay-debug]").length,
  );
  const diagnostics = await page.evaluate(() => {
    return {
      url: window.location.href,
      search: window.location.search,
      hasRelayDebugParam: new URLSearchParams(window.location.search).has("relayDebug"),
      revealScreensInDom: document.querySelectorAll("[data-h2h-recipient-reveal]").length,
      battlefields: document.querySelectorAll("[data-h2h-battlefield]").length,
      anyScoreCellPresent: document.querySelectorAll("[data-h2h-team-score]").length,
    };
  });
  const sampleText = await page.evaluate(() => {
    const el = document.querySelector("[data-h2h-relay-debug]");
    return el ? (el.textContent ?? "").slice(0, 200) : null;
  });
  await browser.close();
  return { present, sampleText, diagnostics };
}

const withFlag = await getOverlayPresence(BASE, true);
console.log(`WITH ?relayDebug=1:  present=${withFlag.present}`);
console.log(`  diagnostics: ${JSON.stringify(withFlag.diagnostics)}`);
if (withFlag.sampleText) {
  console.log(`  first 200 chars: ${withFlag.sampleText.replace(/\n/g, " | ")}`);
}
const withoutFlag = await getOverlayPresence(BASE, false);
console.log(`WITHOUT flag:        present=${withoutFlag.present}`);
console.log(`  diagnostics: ${JSON.stringify(withoutFlag.diagnostics)}`);

const pass = withFlag.present === 1 && withoutFlag.present === 0;
console.log(`\n${pass ? "PASS" : "FAIL"} — runtime gate ${pass ? "works correctly" : "is broken"}`);
process.exit(pass ? 0 : 1);
