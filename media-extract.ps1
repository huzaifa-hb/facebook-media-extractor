param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cli = Join-Path $scriptDir "bin\media-extract.js"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required for media-extract. Install Node.js, then run this command again."
}

if (-not (Test-Path -LiteralPath $cli)) {
    throw "media-extract CLI was not found at $cli"
}

& node $cli @RemainingArgs
