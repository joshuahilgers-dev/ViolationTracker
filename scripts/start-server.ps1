$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $ProjectRoot "logs"
$OutLog = Join-Path $LogDir "server.out.log"
$ErrLog = Join-Path $LogDir "server.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $ProjectRoot

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path $nodePath)) {
  throw "Node.js was not found. Add node.exe to the machine PATH or install it at C:\Program Files\nodejs\node.exe."
}
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$timestamp] Starting Technology Violation Tracker from $ProjectRoot with $nodePath" | Add-Content -Path $OutLog

try {
  $command = "`"$nodePath`" server.js >> `"$OutLog`" 2>> `"$ErrLog`""
  & $env:ComSpec /d /s /c $command
  $exitCode = $LASTEXITCODE
} catch {
  $exitCode = 1
  $errorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$errorTimestamp] Startup failed: $($_.Exception.Message)" | Add-Content -Path $ErrLog
}

$stopTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stopTimestamp] Technology Violation Tracker stopped with exit code $exitCode" | Add-Content -Path $OutLog
exit $exitCode
