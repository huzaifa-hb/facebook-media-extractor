#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  appendJsonl,
  classifyTruthLabel,
  defaultOutputDir,
  detectAdapter,
  ensureOutputTree,
  htmlDecode,
  isAllowedByMedia,
  isFacebookCdnUrl,
  isLikelyBadAssetUrl,
  isUsefulMedia,
  normalizeFacebookCdnCandidates,
  outputFilename,
  parseArgs,
  redactUrl,
  scoreMedia,
  sha256Buffer
} = require("../lib/media-core");

const HELP = `
Usage:
  media-extract "<url>" [--out <folder>] [--media all|images|videos] [--adapter auto|facebook-ads-library|facebook-profile|generic-page]

Options:
  --out <folder>        Output folder. Defaults to %USERPROFILE%\\Downloads\\media-extract-runs\\<site>-<timestamp>
  --media <mode>        all, images, or videos. Default: all
  --adapter <adapter>   auto, facebook-ads-library, facebook-profile, generic-page
  --max-items <n>       Stop after n saved assets/ad cards where practical. 0 means uncapped.
  --scroll-rounds <n>   Max scroll rounds. Default: 90
  --headful <bool>      Show browser. Default: false
  --min-bytes <n>       Minimum valid media byte size. Default: 12000
  --min-dimension <n>   Minimum valid image dimension. Default: 300
`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser(headful) {
  const options = {
    headless: !headful,
    viewport: { width: 1365, height: 900 },
    acceptDownloads: true
  };
  try {
    return await chromium.launch({ ...options, channel: "chrome" });
  } catch (error) {
    try {
      return await chromium.launch(options);
    } catch (fallbackError) {
      throw new Error(
        "Could not launch Chrome or Playwright Chromium. Install Chrome, or run `npx playwright install chromium` inside the media-extractor folder.\n" +
          `Chrome error: ${error.message}\nPlaywright error: ${fallbackError.message}`
      );
    }
  }
}

function contentTypeKind(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/")) return "image";
  if (type.includes("video/")) return "video";
  return null;
}

function addCandidate(map, candidate, adapter) {
  if (!candidate || !candidate.url) return;
  const url = htmlDecode(candidate.url);
  if (isLikelyBadAssetUrl(url, adapter)) return;
  const kind = candidate.kind || contentTypeKind(candidate.contentType) || "unknown";
  map.set(url, { ...candidate, url, kind });
}

async function collectDomCandidates(page, adapter) {
  const raw = await page.evaluate(() => {
    const candidates = [];
    const add = (item) => candidates.push(item);

    for (const img of Array.from(document.images)) {
      add({
        url: img.currentSrc || img.src || "",
        kind: "image",
        width: img.naturalWidth || null,
        height: img.naturalHeight || null,
        source: "dom-image"
      });
      for (const part of String(img.srcset || "").split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) add({ url, kind: "image", source: "dom-srcset" });
      }
    }

    for (const source of Array.from(document.querySelectorAll("source[src], source[srcset]"))) {
      const src = source.src || "";
      const srcset = source.getAttribute("srcset") || "";
      if (src) add({ url: src, kind: "unknown", source: "dom-source" });
      for (const part of srcset.split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) add({ url, kind: "unknown", source: "dom-source-srcset" });
      }
    }

    for (const video of Array.from(document.querySelectorAll("video"))) {
      if (video.currentSrc || video.src) add({ url: video.currentSrc || video.src, kind: "video", source: "dom-video" });
      if (video.poster) add({ url: video.poster, kind: "image", source: "dom-video-poster" });
    }

    for (const link of Array.from(document.querySelectorAll("a[href]"))) {
      const href = link.href || "";
      if (/\.(jpg|jpeg|png|webp|gif|avif|mp4|mov|webm|m4v)(\?|$)/i.test(href)) {
        add({ url: href, kind: "unknown", source: "dom-link" });
      }
    }

    return candidates;
  });

  const candidates = new Map();
  for (const item of raw) addCandidate(candidates, item, adapter);
  return candidates;
}

async function collectAdCards(page) {
  return page.evaluate(() => {
    const normalizeLines = (text) =>
      String(text || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const blocks = new Map();
    const elements = Array.from(document.querySelectorAll("div, span"));
    const bodyLines = normalizeLines(document.body.innerText || "");

    const fallbackWindow = (id) => {
      const idx = bodyLines.findIndex((line) => line.includes(`Library ID: ${id}`));
      if (idx < 0) return `Library ID: ${id}`;
      const start = Math.max(0, idx - 3);
      const end = Math.min(bodyLines.length, idx + 22);
      return bodyLines.slice(start, end).join("\n");
    };

    for (const element of elements) {
      const text = element.innerText || element.textContent || "";
      if (!/Library ID:\s*\d+/.test(text)) continue;
      let node = element;
      let bestText = null;
      for (let i = 0; i < 8 && node.parentElement; i += 1) {
        node = node.parentElement;
        const parentText = node.innerText || "";
        const ids = parentText.match(/Library ID:\s*\d+/g) || [];
        if (parentText.includes("Sponsored") && ids.length === 1 && parentText.length < 2500) {
          if (!bestText || parentText.length < bestText.length) bestText = parentText;
        }
      }
      const idMatch = text.match(/Library ID:\s*(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const cardText = bestText || fallbackWindow(id);
      const match = cardText.match(/Library ID:\s*(\d+)/) || idMatch;
      if (!match) continue;
      if (blocks.has(id) && blocks.get(id).raw_text.length >= cardText.length) continue;
      const lines = normalizeLines(cardText);
      const status = lines.find((line) => /^(Active|Inactive)$/i.test(line)) || null;
      const started = lines.find((line) => /^Started running on /i.test(line)) || null;
      const sponsoredIndex = lines.findIndex((line) => /^Sponsored$/i.test(line));
      const pageName = sponsoredIndex > 0 ? lines[sponsoredIndex - 1] : null;
      const destination = lines.find((line) => /^[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line)) || null;
      const ctas = ["Shop now", "Learn more", "Sign up", "Apply now", "Book now", "Download", "Contact us", "Get offer"];
      const cta = lines.find((line) => ctas.some((candidate) => candidate.toLowerCase() === line.toLowerCase())) || null;
      blocks.set(id, {
        library_id: id,
        status,
        started_running: started ? started.replace(/^Started running on\s*/i, "") : null,
        page_name: pageName,
        destination,
        cta,
        raw_text: cardText.slice(0, 4000)
      });
    }
    return Array.from(blocks.values());
  });
}

async function scrollPage(page, options, adapter) {
  let stableRounds = 0;
  let lastHeight = 0;
  let lastTextLength = 0;
  let lastAdCount = 0;
  const maxRounds = Number(options.scrollRounds || 90);
  const maxItems = Number(options.maxItems || 0);

  for (let round = 1; round <= maxRounds; round += 1) {
    await page.mouse.wheel(0, 1400);
    await sleep(adapter === "facebook-ads-library" ? 1400 : 900);
    const state = await page.evaluate(() => ({
      height: document.body.scrollHeight,
      textLength: document.body.innerText.length,
      adCount: (document.body.innerText.match(/Library ID:\s*\d+/g) || []).length
    }));

    if (round % 5 === 0 || round === 1) {
      log(`Scroll ${round}: page height ${state.height}, visible ad ids ${state.adCount}`);
    }

    const enoughAdCards = adapter === "facebook-ads-library" && maxItems > 0 && state.adCount >= maxItems;
    if (enoughAdCards && round >= 3) break;

    if (state.height === lastHeight && state.textLength === lastTextLength && state.adCount === lastAdCount) stableRounds += 1;
    else stableRounds = 0;

    lastHeight = state.height;
    lastTextLength = state.textLength;
    lastAdCount = state.adCount;
    if (stableRounds >= 5) break;
  }
}

async function fetchCandidate(context, url, referer) {
  try {
    const response = await context.request.get(url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8",
        Referer: referer
      },
      timeout: 30000
    });
    if (!response.ok()) return { ok: false, status: response.status(), url };
    const contentType = response.headers()["content-type"] || "";
    const buffer = await response.body();
    return { ok: true, url, contentType, buffer, bytes: buffer.length };
  } catch (error) {
    return { ok: false, error: error.message, url };
  }
}

function candidateUrlsFor(url) {
  if (isFacebookCdnUrl(url)) return normalizeFacebookCdnCandidates(url);
  return [htmlDecode(url)];
}

async function chooseBestMedia(context, candidate, options, adapter, referer) {
  const attempts = [];
  for (const url of candidateUrlsFor(candidate.url)) {
    if (isLikelyBadAssetUrl(url, adapter)) continue;
    const fetched = await fetchCandidate(context, url, referer);
    if (!fetched.ok) {
      attempts.push({ url, rejected: true, reason: fetched.error || `HTTP ${fetched.status}` });
      continue;
    }
    const info = isUsefulMedia(fetched.buffer, fetched.contentType, url, options);
    if (!info) {
      attempts.push({ url, rejected: true, reason: `invalid_or_small_${fetched.bytes}` });
      continue;
    }
    if (!isAllowedByMedia(info.kind, options.media)) {
      attempts.push({ url, rejected: true, reason: `filtered_${info.kind}` });
      continue;
    }
    attempts.push({ url, buffer: fetched.buffer, contentType: fetched.contentType, info, score: scoreMedia(fetched.buffer, info, url) });
  }
  return attempts.filter((item) => item.buffer).sort((a, b) => b.score - a.score)[0] || null;
}

function writeReport({ outDir, inputUrl, adapter, saved, rejected, duplicates, adCards, failed }) {
  const labelCounts = saved.reduce((acc, item) => {
    acc[item.truth_label] = (acc[item.truth_label] || 0) + 1;
    return acc;
  }, {});
  const topImages = saved
    .filter((item) => item.kind === "image")
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))
    .slice(0, 8);
  const lines = [
    "# Media Extract Run Report",
    "",
    `Input URL: ${inputUrl}`,
    `Adapter: ${adapter}`,
    `Completed: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Saved assets: ${saved.length}`,
    `- Rejected candidates: ${rejected}`,
    `- Duplicate assets: ${duplicates}`,
    `- Failed candidates: ${failed}`,
    `- Ad cards captured: ${adCards.length}`,
    "",
    "## Truth Labels",
    ""
  ];

  for (const [label, count] of Object.entries(labelCounts)) lines.push(`- ${label}: ${count}`);
  if (!Object.keys(labelCounts).length) lines.push("- none: 0");

  lines.push("", "## Largest Images", "");
  for (const item of topImages) {
    lines.push(`- ${item.file}: ${item.width || "?"}x${item.height || "?"}, ${Math.round(item.bytes / 1024)} KB, ${item.truth_label}`);
  }
  if (!topImages.length) lines.push("- None");

  lines.push(
    "",
    "## Notes",
    "",
    "- This tool saves publicly/browser-accessible media only.",
    "- `largest_public_cdn` means the largest valid public CDN variant found during this run, not the original uploaded file.",
    "- Signed source URLs are redacted from normal reports. Use `manifest.jsonl` URL hashes for traceability without leaking full query tokens."
  );

  fs.writeFileSync(path.join(outDir, "run_report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.url) {
    process.stdout.write(HELP);
    process.exit(options.help ? 0 : 2);
  }

  const adapter = detectAdapter(options.url, options.adapter);
  const outDir = path.resolve(options.out || defaultOutputDir(options.url));
  const dirs = ensureOutputTree(outDir);
  const manifestPath = path.join(outDir, "manifest.jsonl");
  const rejectedPath = path.join(outDir, "rejected.jsonl");
  const adCardsPath = path.join(outDir, "metadata", "ad_cards.jsonl");

  log(`Opening: ${options.url}`);
  log(`Adapter: ${adapter}`);
  log(`Output: ${outDir}`);

  const browser = await launchBrowser(options.headful);
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  const candidates = new Map();

  page.on("response", (response) => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    if (!contentTypeKind(contentType)) return;
    addCandidate(candidates, { url, contentType, kind: contentTypeKind(contentType), source: "network" }, adapter);
  });

  let adCards = [];
  let saved = [];
  let rejected = 0;
  let duplicates = 0;
  let failed = 0;
  const seenHashes = new Set();

  try {
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(adapter === "facebook-ads-library" ? 5000 : 3000);
    await scrollPage(page, options, adapter);

    const domCandidates = await collectDomCandidates(page, adapter);
    for (const [url, candidate] of domCandidates.entries()) candidates.set(url, candidate);

    if (adapter === "facebook-ads-library") {
      adCards = await collectAdCards(page);
      if (options.maxItems > 0) adCards = adCards.slice(0, options.maxItems);
      for (const card of adCards) appendJsonl(adCardsPath, card);
      log(`Captured ad cards: ${adCards.length}`);
    }

    const candidateList = Array.from(candidates.values());
    log(`Media candidates: ${candidateList.length}`);

    let index = 1;
    const maxItems = Number(options.maxItems || 0);
    for (const candidate of candidateList) {
      if (maxItems > 0 && saved.length >= maxItems) break;
      const best = await chooseBestMedia(context, candidate, options, adapter, options.url);
      if (!best) {
        rejected += 1;
        appendJsonl(rejectedPath, { reason: "no_valid_media_variant", source: candidate.source, ...redactUrl(candidate.url) });
        continue;
      }

      const hash = sha256Buffer(best.buffer);
      if (seenHashes.has(hash)) {
        duplicates += 1;
        appendJsonl(rejectedPath, { reason: "duplicate", hash, ...redactUrl(best.url) });
        continue;
      }
      seenHashes.add(hash);

      const truthLabel = classifyTruthLabel({
        adapter,
        info: best.info,
        normalized: htmlDecode(best.url) !== htmlDecode(candidate.url),
        sourceUrl: best.url
      });
      const file = outputFilename({ index, url: best.url, info: best.info, hash });
      const folder = best.info.kind === "video" ? dirs.videos : dirs.images;
      fs.writeFileSync(path.join(folder, file), best.buffer);

      const manifest = {
        file: path.relative(outDir, path.join(folder, file)).replace(/\\/g, "/"),
        kind: best.info.kind,
        truth_label: truthLabel,
        bytes: best.buffer.length,
        width: best.info.width || null,
        height: best.info.height || null,
        hash,
        source: candidate.source || "unknown",
        ...redactUrl(best.url)
      };
      appendJsonl(manifestPath, manifest);
      saved.push(manifest);
      log(`Saved ${manifest.file} (${Math.round(manifest.bytes / 1024)} KB, ${manifest.width || "?"}x${manifest.height || "?"}, ${truthLabel})`);
      index += 1;
    }
  } catch (error) {
    failed += 1;
    appendJsonl(rejectedPath, { reason: "run_error", message: error.message });
    throw error;
  } finally {
    await browser.close();
    writeReport({ outDir, inputUrl: options.url, adapter, saved, rejected, duplicates, adCards, failed });
  }

  log("");
  log("Done.");
  log(`  Saved: ${saved.length}`);
  log(`  Rejected: ${rejected}`);
  log(`  Duplicates: ${duplicates}`);
  log(`  Failed: ${failed}`);
  log(`  Report: ${path.join(outDir, "run_report.md")}`);
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
