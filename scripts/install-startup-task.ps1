param(
  [string]$TaskName = "Technology Violation Tracker",
  [string]$StartupDelay = "PT2M"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$StartScript = Join-Path $PSScriptRoot "start-server.ps1"
$PowerShellPath = Join-Path $PSHOME "powershell.exe"

$action = New-ScheduledTaskAction `
  -Execute $PowerShellPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`"" `
  -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = $StartupDelay

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Starts the Technology Violation Tracker after Windows restarts." `
  -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName'."
Write-Host "It will start after system startup with delay $StartupDelay."
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$TaskName'"
