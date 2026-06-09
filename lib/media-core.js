const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0025/g, "%")
    .replace(/\\\//g, "/");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function detectAdapter(url, explicit = "auto") {
  if (explicit && explicit !== "auto") return explicit;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return "generic-page";
  }

  const host = parsed.hostname.toLowerCase();
  const href = parsed.href.toLowerCase();
  if ((host.endsWith("facebook.com") || host.endsWith("fb.com")) && parsed.pathname.includes("/ads/library")) {
    return "facebook-ads-library";
  }
  if (
    host.endsWith("facebook.com") &&
    (href.includes("/photos") || href.includes("/photo") || href.includes("photo.php") || href.includes("fbid="))
  ) {
    return "facebook-profile";
  }
  return "generic-page";
}

function siteSlug(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const host = url.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const page = url.searchParams.get("view_all_page_id") || url.searchParams.get("id") || "";
    return [host, page].filter(Boolean).join("-");
  } catch (_) {
    return "media";
  }
}

function timestampSlug(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function defaultOutputDir(inputUrl) {
  return path.resolve(os.homedir(), "Downloads", "media-extract-runs", `${siteSlug(inputUrl)}-${timestampSlug()}`);
}

function parseArgs(argv) {
  const args = {
    url: null,
    out: null,
    media: "all",
    adapter: "auto",
    maxItems: 0,
    scrollRounds: 90,
    headful: false,
    minBytes: 12000,
    minDimension: 300
  };

  const boolValue = (value) => {
    if (value === undefined) return true;
    return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!args.url && !token.startsWith("--")) {
      args.url = token;
      continue;
    }
    if (!token.startsWith("--")) continue;

    const [keyRaw, inline] = token.slice(2).split("=", 2);
    const key = keyRaw.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = inline !== undefined ? inline : argv[i + 1];
    const consumesNext = inline === undefined && value !== undefined && !String(value).startsWith("--");

    if (key === "out") args.out = value;
    else if (key === "media") args.media = value;
    else if (key === "adapter") args.adapter = value;
    else if (key === "maxItems") args.maxItems = Number(value || 0);
    else if (key === "scrollRounds") args.scrollRounds = Number(value || 90);
    else if (key === "headful") args.headful = boolValue(value);
    else if (key === "minBytes") args.minBytes = Number(value || 12000);
    else if (key === "minDimension") args.minDimension = Number(value || 300);
    else if (key === "help" || key === "h") args.help = true;

    if (consumesNext && key !== "headful") i += 1;
    if (key === "headful" && consumesNext && ["true", "false", "0", "1", "yes", "no", "on", "off"].includes(String(value).toLowerCase())) i += 1;
  }

  return args;
}

function redactUrl(rawUrl) {
  try {
    const url = new URL(htmlDecode(rawUrl));
    return {
      url_redacted: `${url.origin}${url.pathname}`,
      url_hash: sha256Text(url.href)
    };
  } catch (_) {
    return { url_redacted: "[invalid-url]", url_hash: sha256Text(rawUrl) };
  }
}

function fileBaseFromUrl(url, fallback = "asset") {
  try {
    const parsed = new URL(htmlDecode(url));
    const base = parsed.pathname.split("/").filter(Boolean).pop() || fallback;
    return base.replace(/\.(jpg|jpeg|png|webp|gif|avif|mp4|mov|webm|m4v)$/i, "").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120) || fallback;
  } catch (_) {
    return fallback;
  }
}

function extFromUrl(url) {
  const clean = htmlDecode(url).split("?", 1)[0].toLowerCase();
  const match = clean.match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : null;
}

function isFacebookCdnUrl(url) {
  const value = htmlDecode(url);
  return /(^https:\/\/[^/]*\.fbcdn\.net\/|^https:\/\/scontent\.[^/]+\/|^https:\/\/[^/]*scontent[^/]*\.fbcdn\.net\/)/i.test(value);
}

function isLikelyBadAssetUrl(url, adapter = "generic-page") {
  const lower = htmlDecode(url).toLowerCase();
  if (!lower) return true;
  if (lower.includes("emoji") || lower.includes("/rsrc") || lower.includes(".svg")) return true;
  if (lower.includes("static.xx.fbcdn.net") || lower.includes("static.xx.facebook.com")) return true;
  if (lower.includes("/m1/v/t6/") || /\.kf(?:[?#]|$)/i.test(lower)) return true;
  if (adapter === "facebook-ads-library") {
    if (lower.includes("profile_picture")) return true;
    if (/\/v\/t\d+\.\d+-1\//.test(lower)) return true;
    if (/(?:^|[?&_])stp=[^&]*(?:s50x50|s60x60|s100x100|s148x148)/.test(lower)) return true;
  }
  return false;
}

function removeQueryParam(rawUrl, name) {
  const url = htmlDecode(rawUrl);
  const re = new RegExp(`([?&])${name}=[^&]*&?`, "i");
  return url.replace(re, "$1").replace("?&", "?").replace(/[?&]$/, "");
}

function replaceQuerySize(rawUrl, param, size) {
  const url = htmlDecode(rawUrl);
  const re = new RegExp(`([?&])${param}=([^&]*)`, "i");
  return url.replace(re, (_, prefix, value) => `${prefix}${param}=${value.replace(/s\d+x\d+/gi, `s${size}x${size}`)}`);
}

function normalizeFacebookCdnCandidates(rawUrl) {
  const decoded = htmlDecode(rawUrl).trim();
  if (!decoded) return [];

  const candidates = new Set();
  const add = (value) => {
    if (!value) return;
    candidates.add(value.replace(/\/s\d+x\d+\//gi, "/"));
  };

  add(decoded);
  add(removeQueryParam(decoded, "ctp"));
  add(replaceQuerySize(decoded, "stp", 1080));
  add(removeQueryParam(replaceQuerySize(decoded, "stp", 1080), "ctp"));
  add(replaceQuerySize(decoded, "stp", 1440));
  add(removeQueryParam(replaceQuerySize(decoded, "stp", 1440), "ctp"));

  return Array.from(candidates);
}

function imageInfo(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer || []);
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return jpegInfo(buffer);
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buffer.length >= 24) {
    return { kind: "image", ext: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return webpInfo(buffer);
  if (buffer.toString("ascii", 0, 3) === "GIF" && buffer.length >= 10) {
    return { kind: "image", ext: "gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 24 && buffer.toString("ascii", 4, 8) === "ftyp" && /avif|avis|mif1|msf1/.test(buffer.toString("ascii", 8, 24))) {
    return { kind: "image", ext: "avif", width: null, height: null };
  }
  return null;
}

function jpegInfo(buffer) {
  let i = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    i += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (i + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(i);
    if (length < 2) break;
    if (sof.has(marker) && i + 7 < buffer.length) {
      return { kind: "image", ext: "jpg", width: buffer.readUInt16BE(i + 5), height: buffer.readUInt16BE(i + 3) };
    }
    i += length;
  }
  return { kind: "image", ext: "jpg", width: null, height: null };
}

function webpInfo(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 " && buffer.length >= 30) {
    return { kind: "image", ext: "webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { kind: "image", ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { kind: "image", ext: "webp", width, height };
  }
  return { kind: "image", ext: "webp", width: null, height: null };
}

function videoInfo(buffer, contentType = "", url = "") {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer || []);
  const type = String(contentType || "").toLowerCase();
  const ext = extFromUrl(url);
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (["isom", "iso2", "mp41", "mp42", "avc1", "mmp4", "qt  "].includes(brand) || type.includes("video")) {
      return { kind: "video", ext: ext && VIDEO_EXTENSIONS.has(ext) ? ext : brand === "qt  " ? "mov" : "mp4", width: null, height: null };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { kind: "video", ext: "webm", width: null, height: null };
  }
  if (type.includes("video/")) {
    return { kind: "video", ext: ext && VIDEO_EXTENSIONS.has(ext) ? ext : "mp4", width: null, height: null };
  }
  return null;
}

function mediaInfo(buffer, contentType = "", url = "") {
  return imageInfo(buffer) || videoInfo(buffer, contentType, url);
}

function isAllowedByMedia(kind, media) {
  if (media === "all") return true;
  if (media === "images" || media === "image") return kind === "image";
  if (media === "videos" || media === "video") return kind === "video";
  return true;
}

function isUsefulMedia(buffer, contentType, url, options = {}) {
  const info = mediaInfo(buffer, contentType, url);
  if (!info) return null;
  const minBytes = Number(options.minBytes || 12000);
  const minDimension = Number(options.minDimension || 300);
  if (buffer.length < minBytes) return null;
  if (info.kind === "image" && info.width && info.height && (info.width < minDimension || info.height < minDimension)) return null;
  return info;
}

function scoreMedia(buffer, info, url = "") {
  const pixels = info.width && info.height ? info.width * info.height : 0;
  let score = Math.min(buffer.length / 1024, 10000) + Math.min(pixels / 1000, 10000);
  const lower = htmlDecode(url).toLowerCase();
  if (/_o\./.test(lower)) score += 500;
  if (/_n\./.test(lower)) score += 250;
  if (/_b\./.test(lower)) score += 100;
  if (/s\d+x\d+/.test(lower) || /(?:^|[?&_])ctp=/.test(lower)) score -= 600;
  return score;
}

function classifyTruthLabel({ adapter, info, normalized, sourceUrl }) {
  if (!info) return "failed";
  if (info.kind === "video") return "video_public_cdn";
  const isMeta = String(adapter || "").startsWith("facebook") || isFacebookCdnUrl(sourceUrl);
  if (isMeta) {
    if (info.width && info.height && Math.max(info.width, info.height) < 600) return "thumbnail_only";
    return "largest_public_cdn";
  }
  return normalized ? "largest_public_cdn" : "browser_rendered";
}

function ensureOutputTree(outDir) {
  const dirs = {
    root: outDir,
    images: path.join(outDir, "assets", "images"),
    videos: path.join(outDir, "assets", "videos"),
    metadata: path.join(outDir, "metadata")
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function outputFilename({ index, url, info, hash }) {
  const dims = info.width && info.height ? `_${info.width}x${info.height}` : "";
  return `${String(index).padStart(4, "0")}_${fileBaseFromUrl(url, "asset")}${dims}_${hash.slice(0, 10)}.${info.ext}`;
}

module.exports = {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  appendJsonl,
  classifyTruthLabel,
  defaultOutputDir,
  detectAdapter,
  ensureOutputTree,
  fileBaseFromUrl,
  htmlDecode,
  isAllowedByMedia,
  isFacebookCdnUrl,
  isLikelyBadAssetUrl,
  isUsefulMedia,
  mediaInfo,
  normalizeFacebookCdnCandidates,
  outputFilename,
  parseArgs,
  redactUrl,
  scoreMedia,
  sha256Buffer,
  sha256Text,
  siteSlug
};
