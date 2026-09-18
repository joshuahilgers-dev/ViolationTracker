param(
  [string]$TaskName = "ViolationTracker",
  [int]$Port = 4173,
  [string]$BackupRoot = "W:\ViolationTracker-Backups"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-LastCommandSucceeded([string]$Message) {
  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

function Get-ListenerProcessId {
  $processIds = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  if ($processIds.Count -gt 1) {
    throw "More than one process is listening on port $Port. Update stopped."
  }
  if ($processIds.Count -eq 0) {
    return $null
  }
  return [int]$processIds[0]
}

function Test-TrackerHealth {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://localhost:$Port/api/auth/config" `
      -TimeoutSec 3
    if ($response.StatusCode -ne 200) {
      return $false
    }
    $config = $response.Content | ConvertFrom-Json
    return $config.PSObject.Properties.Name -contains "allowedEmailDomain"
  } catch {
    return $false
  }
}

function Get-VerifiedNodeProcess([int]$ProcessId) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
  if (-not $process -or $process.Name -ne "node.exe" -or $process.CommandLine -notmatch "server\.js") {
    throw "Port $Port is not owned by the expected Technology Violation Tracker Node process. Nothing was stopped."
  }
  return $process
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Open PowerShell as Administrator, then run this updater again."
}

$AppPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DataPath = Join-Path $AppPath "data"
$EnvironmentPath = Join-Path $AppPath ".env"
$HealthUrl = "http://localhost:$Port/api/auth/config"

Set-Location $AppPath

$trackedChanges = @(git status --porcelain --untracked-files=no)
Assert-LastCommandSucceeded "Could not inspect the Git working tree."
if ($trackedChanges.Count -gt 0) {
  throw "Tracked server files have local changes. Update stopped so nothing is overwritten."
}

$CurrentBranch = git branch --show-current
Assert-LastCommandSucceeded "Could not determine the current Git branch."
$CurrentBranch = $CurrentBranch.Trim()
if ($CurrentBranch -ne "main") {
  throw "The server checkout is not on the main branch. Update stopped."
}

$tasks = @(Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop)
if ($tasks.Count -ne 1) {
  throw "Expected exactly one scheduled task named '$TaskName'. Found $($tasks.Count)."
}
$task = $tasks[0]
$taskActionText = @(
  foreach ($action in @($task.Actions)) {
    foreach ($propertyName in @("Execute", "Arguments", "WorkingDirectory")) {
      $property = $action.PSObject.Properties[$propertyName]
      if ($property -and $property.Value) {
        [string]$property.Value
      }
    }
  }
) -join " "
if ($taskActionText -notlike "*$AppPath*") {
  throw "Scheduled task '$TaskName' does not point to $AppPath. Update stopped."
}

$ListenerProcessId = Get-ListenerProcessId
if ($null -ne $ListenerProcessId) {
  Get-VerifiedNodeProcess $ListenerProcessId | Out-Null
  if (-not (Test-TrackerHealth)) {
    throw "Port $Port is not serving the expected tracker health endpoint. Nothing was stopped."
  }
}

if (-not (Test-Path -LiteralPath $DataPath)) {
  throw "The production data folder was not found at $DataPath. Update stopped."
}
$BackupPath = Join-Path $BackupRoot (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
Copy-Item -LiteralPath $DataPath -Destination (Join-Path $BackupPath "data") -Recurse -Force
if (Test-Path -LiteralPath $EnvironmentPath) {
  Copy-Item -LiteralPath $EnvironmentPath -Destination (Join-Path $BackupPath ".env") -Force
}
Write-Host "Backup created: $BackupPath"

$BeforeCommit = git rev-parse HEAD
Assert-LastCommandSucceeded "Could not read the current commit."
$BeforeCommit = $BeforeCommit.Trim()

git pull --ff-only origin main
Assert-LastCommandSucceeded "Git pull failed. The tracker was not restarted."

$AfterCommit = git rev-parse HEAD
Assert-LastCommandSucceeded "Could not read the updated commit."
$AfterCommit = $AfterCommit.Trim()

$dependencyChanges = @(git diff --name-only $BeforeCommit $AfterCommit -- package.json package-lock.json)
Assert-LastCommandSucceeded "Could not check whether dependencies changed."
if ($dependencyChanges.Count -gt 0) {
  Write-Host "Package files changed. Installing exact dependencies..."
  npm ci
  Assert-LastCommandSucceeded "Dependency installation failed. The tracker was not restarted."
}

npm run build
Assert-LastCommandSucceeded "Build failed. The tracker was not restarted."

if ($task.State.ToString() -eq "Running") {
  Stop-ScheduledTask -TaskName $TaskName
}

for ($attempt = 1; $attempt -le 10; $attempt++) {
  if ($null -eq (Get-ListenerProcessId)) {
    break
  }
  Start-Sleep -Seconds 1
}

$RemainingProcessId = Get-ListenerProcessId
if ($null -ne $RemainingProcessId) {
  if ($null -eq $ListenerProcessId -or $RemainingProcessId -ne $ListenerProcessId) {
    throw "A different process is now using port $Port. Nothing else was stopped."
  }
  Get-VerifiedNodeProcess $RemainingProcessId | Out-Null
  Stop-Process -Id $RemainingProcessId -Force
}

Start-ScheduledTask -TaskName $TaskName

$Healthy = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
  if (Test-TrackerHealth) {
    $Healthy = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $Healthy) {
  throw "The update installed, but the tracker did not restart successfully. Check logs\server.err.log."
}

$UpdatedProcessId = Get-ListenerProcessId
if ($null -eq $UpdatedProcessId) {
  throw "The health check passed, but no process was found listening on port $Port."
}
Get-VerifiedNodeProcess $UpdatedProcessId | Out-Null

Write-Host ""
Write-Host "Technology Violation Tracker updated successfully."
Write-Host "Commit: $AfterCommit"
Write-Host "Backup: $BackupPath"
Write-Host "Task: $TaskName"
Write-Host "Health: $HealthUrl"
Write-Host ""
Write-Host "Refresh the tracker in your browser with Ctrl+F5."
