param(
    [switch]$SkipProfile,
    [switch]$SkipNpmInstall,
    [switch]$InstallPlaywrightBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cli = Join-Path $repoRoot "bin\media-extract.js"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
}

function Assert-Command {
    param(
        [string]$Name,
        [string]$InstallMessage
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallMessage"
    }
}

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
    throw "This installer is for Windows PowerShell or PowerShell 7 on Windows."
}

if (-not (Test-Path -LiteralPath $cli)) {
    throw "Could not find the CLI at $cli. Run this installer from the media-extract repo folder."
}

Assert-Command -Name "node" -InstallMessage "Install Node.js LTS from https://nodejs.org/ and run this installer again."
Assert-Command -Name "npm" -InstallMessage "Install Node.js LTS from https://nodejs.org/ and run this installer again."

$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]") -replace "[^0-9]", "")
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current major version: $nodeMajor"
}

if (-not $SkipNpmInstall) {
    Write-Step "Installing Node dependencies..."
    Push-Location $repoRoot
    try {
        & npm install
    } finally {
        Pop-Location
    }
}

if ($InstallPlaywrightBrowser) {
    Write-Step "Installing Playwright Chromium fallback browser..."
    Push-Location $repoRoot
    try {
        & npx playwright install chromium
    } finally {
        Pop-Location
    }
}

if (-not $SkipProfile) {
    Write-Step "Adding the media-extract command to your PowerShell profile..."

    $escapedCli = $cli.Replace("'", "''")
    $block = @"
# >>> media-extract >>>
function media-extract {
    & node '$escapedCli' @args
}
# <<< media-extract <<<
"@

    $profilePaths = @(
        Join-Path ([Environment]::GetFolderPath("MyDocuments")) "WindowsPowerShell\Microsoft.PowerShell_profile.ps1",
        Join-Path ([Environment]::GetFolderPath("MyDocuments")) "PowerShell\Microsoft.PowerShell_profile.ps1"
    ) | Select-Object -Unique

    foreach ($profilePath in $profilePaths) {
        $profileDir = Split-Path -Parent $profilePath
        New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

        $existing = ""
        if (Test-Path -LiteralPath $profilePath) {
            $existing = Get-Content -LiteralPath $profilePath -Raw
        }

        $pattern = "(?s)# >>> media-extract >>>.*?# <<< media-extract <<<"
        if ($existing -match $pattern) {
            $updated = [regex]::Replace($existing, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
        } elseif ([string]::IsNullOrWhiteSpace($existing)) {
            $updated = "$block`r`n"
        } else {
            $updated = $existing.TrimEnd() + "`r`n`r`n$block`r`n"
        }

        Set-Content -LiteralPath $profilePath -Value $updated -Encoding UTF8
        Write-Host "Updated: $profilePath"
    }
}

Write-Step "Checking the CLI..."
& node $cli --help | Select-Object -First 14

Write-Host ""
Write-Host "Done. Close PowerShell, open it again, then run:" -ForegroundColor Green
Write-Host 'media-extract "https://example.com"'
