# Run-VoiceScenario.ps1
# Purpose : Unattended end-to-end test: starts the app, speaks a prompt through the speakers (the mic hears it), presses the hotkey with simulated keys.
# Inputs  : -PromptText, -HotkeyDuringReplySeconds (0 = never), -SecondsBeforeSpeaking, -TotalSeconds, -Model.
# Outputs : app console output in tests\scenario-output.txt, printed at the end; a line saying whether the app process is still alive.
# Depends : PowerShell 5.1, System.Speech, node, a working speaker and microphone.
param([string]$PromptText = 'What is two plus two? Answer in one short sentence.', [int]$SecondsBeforeSpeaking = 1, [int]$HotkeyDuringReplySeconds = 0, [int]$TotalSeconds = 75, [string]$Model = 'claude-haiku-4.5')
Add-Type -AssemblyName System.Speech
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class KeySender { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Chord() { keybd_event(0x11,0,0,UIntPtr.Zero); keybd_event(0x10,0,0,UIntPtr.Zero); keybd_event(0x57,0,0,UIntPtr.Zero); keybd_event(0x57,0,2,UIntPtr.Zero); keybd_event(0x10,0,2,UIntPtr.Zero); keybd_event(0x11,0,2,UIntPtr.Zero); } }
'@
$root = Split-Path $PSScriptRoot
$outputPath = Join-Path $PSScriptRoot 'scenario-output.txt'
Remove-Item $outputPath, "$outputPath.err" -ErrorAction SilentlyContinue
$app = Start-Process node -ArgumentList "`"$root\source\start-voice-chat.ts`"", '--model', $Model -WorkingDirectory $env:TEMP -RedirectStandardOutput $outputPath -RedirectStandardError "$outputPath.err" -PassThru -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline -and -not ((Get-Content $outputPath -ErrorAction SilentlyContinue) -match 'Ready\.')) { Start-Sleep 2 }
Start-Sleep 4
[KeySender]::Chord(); Start-Sleep -Seconds $SecondsBeforeSpeaking
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer; $voice.SelectVoice('Microsoft David Desktop'); $voice.Speak($PromptText)
$startedAt = Get-Date; $hasPressedDuringReply = $false
while (((Get-Date) - $startedAt).TotalSeconds -lt $TotalSeconds -and -not $app.HasExited) {
  Start-Sleep 1
  if ((Get-Content $outputPath -Raw) -match '\[turnCompleted\]|CRASH') { Start-Sleep 3; break }
  if ($HotkeyDuringReplySeconds -gt 0 -and -not $hasPressedDuringReply -and (Get-Content $outputPath -Raw) -match 'copilot:' ) { Start-Sleep -Seconds $HotkeyDuringReplySeconds; [KeySender]::Chord(); $hasPressedDuringReply = $true; Write-Host 'HOTKEY PRESSED DURING REPLY' }
}
Write-Host ('APP ALIVE: ' + (-not $app.HasExited))
Get-Content $outputPath; Write-Host '--- stderr ---'; Get-Content "$outputPath.err" | Select-Object -First 30
if (-not $app.HasExited) { Stop-Process -Id $app.Id }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'SpeechWorker|MicCapture' } | ForEach-Object { Stop-Process -Id $_.ProcessId }
