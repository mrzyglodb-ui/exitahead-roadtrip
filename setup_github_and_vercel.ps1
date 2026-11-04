# Standalone GitHub + Vercel Setup Script for ExitAhead (Roadtrip App)
# Completely isolated in c:\Users\bmrzy\ roadtrip (never touches any other project)

$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot
Set-Location $projectDir

$gitDir = "C:\Users\bmrzy\.gemini\antigravity\scratch\tools\git\cmd"
$ghExe  = "C:\Users\bmrzy\.gemini\antigravity\scratch\tools\gh\bin\gh.exe"
$env:PATH = "$gitDir;C:\Users\bmrzy\.gemini\antigravity\scratch\tools\gh\bin;$env:PATH"

$repoName = "exitahead-roadtrip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  ExitAhead Roadtrip — Standalone GitHub & Vercel Setup  " -ForegroundColor Cyan
Write-Host "  Directory: $projectDir" -ForegroundColor Gray
Write-Host "  Target Repo: $repoName (100% separate project)" -ForegroundColor Gray
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check GitHub CLI authentication
$authStatus = & $ghExe auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Step 1: Logging in to GitHub in your browser..." -ForegroundColor Yellow
  Write-Host "Copy the one-time code shown below and authorize in the browser window that opens." -ForegroundColor White
  & $ghExe auth login --hostname github.com --git-protocol https --web
} else {
  Write-Host "Step 1: Already authenticated with GitHub CLI." -ForegroundColor Green
}

# 2. Configure Git credential helper via gh
& $ghExe auth setup-git

# 3. Get GitHub username
$ghUser = (& $ghExe api user --jq ".login").Trim()
Write-Host "Authenticated as GitHub user: $ghUser" -ForegroundColor Green

# 4. Create standalone repository (or push if it already exists)
$existingOrigin = git remote get-url origin 2>$null
if (-not $existingOrigin) {
  Write-Host "Step 2: Creating new standalone GitHub repository '$ghUser/$repoName'..." -ForegroundColor Yellow
  & $ghExe repo create $repoName --public --description "ExitAhead — Road trip next 5 highway exits and services web app" --source=. --remote=origin --push
} else {
  Write-Host "Step 2: Pushing latest commits to $existingOrigin..." -ForegroundColor Yellow
  git push -u origin main
}

$repoUrl = "https://github.com/$ghUser/$repoName"
Write-Host ""
Write-Host "SUCCESS! Standalone GitHub repository is live at:" -ForegroundColor Green
Write-Host "  $repoUrl" -ForegroundColor Cyan
Write-Host ""

# 5. Open Vercel One-Click Import for this exact repository
$vercelImportUrl = "https://vercel.com/new/import?s=$([uri]::EscapeDataString($repoUrl))&project-name=$repoName"
Write-Host "Step 3: Opening Vercel in your browser to deploy '$repoName' as a separate Vercel project..." -ForegroundColor Yellow
Start-Process $vercelImportUrl
Write-Host "Click 'Deploy' in the Vercel tab that just opened to get your live https://exitahead-roadtrip.vercel.app URL!" -ForegroundColor Green
