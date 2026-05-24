# Comm Center — install Windows auto-start at login.
# Run from an elevated PowerShell once:  .\install-autostart.ps1

$ErrorActionPreference = 'Stop'

$projectDir = $PSScriptRoot
$startBat = Join-Path $projectDir 'start.bat'

if (-not (Test-Path $startBat)) {
  Write-Error "start.bat not found at $startBat"
  exit 1
}

$taskName = 'CommCenter'

# Remove any existing task with this name (idempotent re-install)
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Removing existing task '$taskName'..."
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Run as the current user, hidden window, at logon, with auto-restart on failure
$action = New-ScheduledTaskAction -Execute $startBat -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -DontStopOnIdleEnd `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host ""
Write-Host "✓ Installed scheduled task '$taskName'." -ForegroundColor Green
Write-Host "  Comm Center will launch automatically when you log in."
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  Start now:   Start-ScheduledTask -TaskName $taskName"
Write-Host "  Stop:        Stop-ScheduledTask  -TaskName $taskName"
Write-Host "  Status:      Get-ScheduledTask   -TaskName $taskName | Get-ScheduledTaskInfo"
Write-Host "  Uninstall:   Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
Write-Host ""
Write-Host "Dashboard: http://localhost:3002"
