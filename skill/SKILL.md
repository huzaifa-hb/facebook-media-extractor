---
name: media-extract
description: Browser-backed public media extraction for URLs, especially Facebook profile/photo pages and Meta/Facebook Ads Library links. Use when the user asks to download, save, extract, capture, archive, or audit images/videos/creatives from a webpage, Facebook profile photos page, Facebook Ads Library URL, or generic public URL, and wants a reusable truthful workflow rather than one-off scraping.
---

# Media Extract

Use the user-wide `media-extract` CLI for public webpage media extraction. The tool is designed for truthful output: it validates real media bytes, deduplicates by hash, avoids claiming original upload files, and writes a manifest plus report.

## Command

Prefer:

```powershell
media-extract "<url>"
```

For explicit output:

```powershell
media-extract "<url>" --out "<folder>" --media all --adapter auto --max-items 0 --scroll-rounds 90 --headful false
```

If the PowerShell function is not loaded in the current shell, call the shim directly:

```powershell
C:\Users\Huzaifa\Downloads\Codex\media-extract.ps1 "<url>"
```

## Workflow

1. Run `media-extract` with the user-provided URL.
2. Use `--headful true` only when the page needs visible browser interaction or login/cookie consent.
3. Check `run_report.md` first, then `manifest.jsonl`.
4. Report saved count, rejected/duplicate count, output folder, and the truth labels used.
5. Do not say "original" or "full-size" unless the report proves it. Use "largest public CDN version found" for Meta/Facebook assets.

## Output Contract

The CLI writes:

- `assets/images/`
- `assets/videos/`
- `metadata/ad_cards.jsonl`
- `manifest.jsonl`
- `rejected.jsonl`
- `run_report.md`

Truth labels:

- `largest_public_cdn`: largest valid public CDN variant found in this run.
- `browser_rendered`: media exactly served/rendered by the browser.
- `thumbnail_only`: only small media variants were publicly available.
- `video_public_cdn`: public video file captured.
- `failed`: no valid media was saved for the candidate.

## Guardrails

- Extract only public/browser-accessible media.
- Do not bypass private content, login walls, paywalls, or platform restrictions.
- Do not expose full signed CDN URLs in user-facing summaries.
- Treat Facebook Ads Library and Facebook profile/photo pages as Meta-specific routes; use generic extraction only as fallback.
