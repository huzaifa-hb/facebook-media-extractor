const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyTruthLabel,
  defaultOutputDir,
  detectAdapter,
  htmlDecode,
  isLikelyBadAssetUrl,
  isUsefulMedia,
  normalizeFacebookCdnCandidates,
  parseArgs,
  redactUrl
} = require("../lib/media-core");

test("htmlDecode decodes Facebook CDN escaped URL pieces", () => {
  assert.equal(htmlDecode("https:\\/\\/x.test\\/a.jpg?x=1&amp;y=2\\u0026z=3"), "https://x.test/a.jpg?x=1&y=2&z=3");
});

test("normalizeFacebookCdnCandidates removes ctp thumbnail sizing", () => {
  const url = "https://scontent.example/v/t39/abc.jpg?stp=dst-jpg_s206x206_tt6&amp;ctp=s206x206&amp;oh=token";
  const variants = normalizeFacebookCdnCandidates(url);
  assert.ok(variants.some((candidate) => !candidate.includes("ctp=")));
  assert.ok(variants.some((candidate) => candidate.includes("s1080x1080")));
});

test("detectAdapter routes Meta pages and generic pages", () => {
  assert.equal(detectAdapter("https://www.facebook.com/ads/library/?id=1"), "facebook-ads-library");
  assert.equal(detectAdapter("https://www.facebook.com/some.profile/photos"), "facebook-profile");
  assert.equal(detectAdapter("https://example.com/page"), "generic-page");
});

test("isLikelyBadAssetUrl rejects Facebook UI assets for ads library", () => {
  assert.equal(isLikelyBadAssetUrl("https://static.xx.fbcdn.net/rsrc.php/yT/r/x.webp", "facebook-ads-library"), true);
  assert.equal(isLikelyBadAssetUrl("https://scontent.xx.fbcdn.net/v/t39.30808-1/avatar.jpg?stp=dst-jpg_s148x148_tt6", "facebook-ads-library"), true);
});

test("isUsefulMedia accepts real png signature and dimensions", () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]),
    Buffer.from([0, 0, 2, 0, 0, 0, 2, 0]),
    Buffer.alloc(13000)
  ]);
  const info = isUsefulMedia(png, "image/png", "https://example.com/a.png", { minBytes: 12000, minDimension: 300 });
  assert.equal(info.ext, "png");
  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
});

test("isUsefulMedia rejects KEYF fragments", () => {
  const keyf = Buffer.concat([Buffer.from("KEYF"), Buffer.alloc(20000)]);
  assert.equal(isUsefulMedia(keyf, "image/jpeg", "https://example.com/a.kf"), null);
});

test("redactUrl drops signed query and keeps hash", () => {
  const redacted = redactUrl("https://scontent.example/path/a.jpg?oh=secret&oe=soon");
  assert.equal(redacted.url_redacted, "https://scontent.example/path/a.jpg");
  assert.ok(redacted.url_hash.length === 64);
});

test("truth labels do not claim original full size", () => {
  assert.equal(
    classifyTruthLabel({ adapter: "facebook-profile", info: { kind: "image", width: 1080, height: 1080 }, normalized: true, sourceUrl: "https://scontent.example/a.jpg" }),
    "largest_public_cdn"
  );
  assert.equal(
    classifyTruthLabel({ adapter: "facebook-profile", info: { kind: "image", width: 320, height: 320 }, normalized: true, sourceUrl: "https://scontent.example/a.jpg" }),
    "thumbnail_only"
  );
});

test("parseArgs supports public CLI options", () => {
  const args = parseArgs(["https://example.com", "--media", "images", "--max-items", "12", "--headful", "true"]);
  assert.equal(args.url, "https://example.com");
  assert.equal(args.media, "images");
  assert.equal(args.maxItems, 12);
  assert.equal(args.headful, true);
});

test("defaultOutputDir uses the user Downloads folder", () => {
  const out = defaultOutputDir("https://example.com/page");
  assert.match(out.replace(/\\/g, "/"), /\/Downloads\/media-extract-runs\/example-com-/);
});
