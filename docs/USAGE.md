# Usage

## Basic Command

```powershell
media-extract "<url>"
```

Example:

```powershell
media-extract "https://example.com/gallery"
```

## Useful Options

```powershell
media-extract "<url>" --max-items 25
media-extract "<url>" --media images
media-extract "<url>" --media videos
media-extract "<url>" --headful true
media-extract "<url>" --scroll-rounds 120
media-extract "<url>" --out "C:\Users\YourName\Downloads\my-media-run"
```

## Adapter Selection

The default is `--adapter auto`.

Use a manual adapter only when you know the page type:

```powershell
media-extract "<url>" --adapter facebook-ads-library
media-extract "<url>" --adapter facebook-profile
media-extract "<url>" --adapter generic-page
```

## Reading Results

Open `run_report.md` first. It shows:

- how many assets were saved
- how many candidates were rejected
- how many duplicates were skipped
- what truth labels were assigned
- the largest images saved in that run

Then check `assets\images` and `assets\videos`.

Use `manifest.jsonl` when you need a machine-readable list of saved files.

Use `rejected.jsonl` when you need to understand why something was skipped.

## Recommended Facebook Ads Library Command

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --max-items 50 --scroll-rounds 90
```

If the page is loading slowly:

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --max-items 50 --scroll-rounds 140 --headful true
```

## Important Limits

This tool saves public/browser-accessible media. It cannot guarantee original uploaded files. For Meta pages, `largest_public_cdn` means the largest valid public CDN variant found during that run.
