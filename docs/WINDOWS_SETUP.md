# Windows Setup

This guide is for someone setting up `facebook-media-extractor` on a Windows laptop or desktop for the first time.

The installed terminal command is still named `media-extract`.

## 1. Install Node.js

Install Node.js LTS from:

```text
https://nodejs.org/
```

After installing, close PowerShell and open it again.

Check it:

```powershell
node --version
npm --version
```

Node.js must be version 20 or newer.

## 2. Install Git

Install Git for Windows from:

```text
https://git-scm.com/download/win
```

After installing, close PowerShell and open it again.

Check it:

```powershell
git --version
```

## 3. Download the Repo

```powershell
cd "$env:USERPROFILE\Downloads"
git clone https://github.com/huzaifa-hb/facebook-media-extractor.git
cd facebook-media-extractor
```

## 4. Install the Command

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

This does three things:

- installs the Node dependencies
- checks that the CLI can start
- adds `media-extract` to your user PowerShell profile

Close PowerShell and open it again.

## 5. Run It on a Meta URL

```powershell
media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE"
```

For Facebook Ads Library:

```powershell
media-extract "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=1039345822595722" --max-items 25
```

For a Facebook photos page:

```powershell
media-extract "https://www.facebook.com/somepage/photos" --max-items 50
```

Saved files go here:

```text
%USERPROFILE%\Downloads\media-extract-runs\
```

## If You Do Not Want a Permanent Command

Run from inside the repo folder:

```powershell
npm install
node .\bin\media-extract.js "FACEBOOK_ADS_LIBRARY_URL_HERE"
```

or:

```powershell
.\media-extract.ps1 "FACEBOOK_ADS_LIBRARY_URL_HERE"
```

## Common Problems

PowerShell says scripts are disabled:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Chrome cannot launch:

```powershell
npx playwright install chromium
```

`media-extract` is not recognized:

- close PowerShell
- open PowerShell again
- run `media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE"`

Only thumbnails were saved:

- open the run folder
- read `run_report.md`
- check whether the assets are labeled `thumbnail_only`

The tool reports what it actually found. It does not call a thumbnail an original image.
