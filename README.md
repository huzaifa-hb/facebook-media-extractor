# Media Extract

Windows-friendly terminal scraper for public images and videos.

It is built for pages where normal "save image" workflows are painful, especially dynamic pages such as Facebook Ads Library. It opens the page in a real browser, watches media loaded by the page, validates real image/video files, removes duplicates, and writes a clear report.

It does not bypass login walls, private pages, paywalls, or platform restrictions. It only saves media that your browser can publicly load.

## What It Supports

- Facebook Ads Library URLs
- Facebook profile/photo/album-style pages
- Generic webpages as a best-effort fallback
- Images and videos, where publicly served
- Truthful labels instead of claiming "original full-size" without proof

Truth labels used in reports:

- `largest_public_cdn`: largest valid public CDN version found during the run
- `browser_rendered`: media exactly as the browser rendered it
- `thumbnail_only`: only a small/thumbnail asset was publicly available
- `video_public_cdn`: valid public video file found
- `failed`: candidate could not be saved as valid media

## Quick Start on Windows

Open PowerShell and run:

```powershell
git clone https://github.com/YOUR-USER/media-extract.git
cd media-extract
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Close PowerShell, open it again, then run:

```powershell
media-extract "https://example.com"
```

Your files will be saved under:

```text
%USERPROFILE%\Downloads\media-extract-runs\
```

Replace `https://github.com/YOUR-USER/media-extract.git` with the real repository URL after you publish this repo.

## Run Without Installing the Command

If you do not want to add the `media-extract` command to your PowerShell profile:

```powershell
git clone https://github.com/YOUR-USER/media-extract.git
cd media-extract
npm install
node .\bin\media-extract.js "https://example.com"
```

You can also use the repo-local PowerShell wrapper:

```powershell
.\media-extract.ps1 "https://example.com"
```

## Examples

Facebook Ads Library:

```powershell
media-extract "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=1039345822595722" --max-items 25
```

Facebook photo/profile page:

```powershell
media-extract "https://www.facebook.com/somepage/photos" --max-items 50
```

Generic webpage, images only:

```powershell
media-extract "https://example.com/gallery" --media images
```

Choose your own output folder:

```powershell
media-extract "https://example.com/gallery" --out "C:\Users\YourName\Downloads\my-run"
```

Show the browser while it works:

```powershell
media-extract "https://example.com/gallery" --headful true
```

## Command Options

```powershell
media-extract "<url>" `
  --out "<folder>" `
  --media all `
  --adapter auto `
  --max-items 0 `
  --scroll-rounds 90 `
  --headful false
```

Defaults:

- `--media all`
- `--adapter auto`
- `--max-items 0`, meaning no explicit item limit
- `--scroll-rounds 90`
- `--headful false`
- `--out %USERPROFILE%\Downloads\media-extract-runs\<site>-<timestamp>`

Adapters:

- `auto`
- `facebook-ads-library`
- `facebook-profile`
- `generic-page`

## Output Files

Each run creates a folder like this:

```text
media-extract-runs\
  facebook-com-1039345822595722-20260609-153012\
    assets\
      images\
      videos\
    metadata\
      ad_cards.jsonl
    manifest.jsonl
    rejected.jsonl
    run_report.md
```

Important files:

- `assets\images\`: saved images
- `assets\videos\`: saved videos
- `metadata\ad_cards.jsonl`: Facebook Ads Library card text and visible metadata, when available
- `manifest.jsonl`: one record per saved asset
- `rejected.jsonl`: candidates rejected as too small, duplicate, invalid, or unreachable
- `run_report.md`: human-readable summary

Full signed CDN URLs are not written into the normal report. The manifest stores redacted URL paths and URL hashes.

## Troubleshooting

If PowerShell says scripts are disabled, run the installer exactly like this:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

If Chrome cannot launch, install Google Chrome. If that still fails, run:

```powershell
npx playwright install chromium
```

If `media-extract` is not recognized after install, close PowerShell and open it again. The installer adds the command to your user PowerShell profile.

If a site saves only thumbnails, that usually means the larger media was not publicly available to the browser during that run. Check `run_report.md` and `rejected.jsonl` before assuming the tool failed.

## Responsible Use

Use this only for media you have permission to access and use. Respect each website's terms, copyright, and rate limits. This tool is for saving browser-accessible public media, not for bypassing access controls.

## Development

```powershell
npm install
npm test
node .\bin\media-extract.js --help
```
