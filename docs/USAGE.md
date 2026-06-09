# Usage

This is a Meta-first extractor. Use it primarily for Facebook Ads Library and Facebook photo/media pages. Generic webpage extraction exists only as a fallback.

## Basic Meta Command

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE"
```

Real Ads Library example:

```powershell
media-extract "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=1039345822595722" --max-items 25
```

Facebook photos example:

```powershell
media-extract "https://www.facebook.com/somepage/photos" --max-items 50
```

## Useful Options

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --max-items 25
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --media images
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --media videos
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --headful true
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --scroll-rounds 120
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --out "C:\Users\YourName\Downloads\facebook-media-run"
```

## Adapter Selection

The default is `--adapter auto`.

Use a manual adapter only when you know the page type:

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --adapter facebook-ads-library
media-extract "FACEBOOK_PHOTOS_URL_HERE" --adapter facebook-profile
media-extract "PUBLIC_NON_META_URL_HERE" --adapter generic-page
```

Use `generic-page` only as a fallback, not as the main purpose of this repo.

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

This tool saves public/browser-accessible Meta media. It cannot guarantee original uploaded files. For Meta pages, `largest_public_cdn` means the largest valid public CDN variant found during that run.
