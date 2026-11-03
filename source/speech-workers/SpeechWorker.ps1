# SpeechWorker.ps1
# Purpose : Long-lived Windows speech worker: speaks text, lists voices, recognizes dictation.
# Inputs  : JSON lines on stdin: speak{text} | stopSpeaking | listVoices | setVoice{voiceName} | startRecognizing | stopRecognizing | quit
# Outputs : JSON lines on stdout: ready, voices{voiceNames}, speakingStarted, speakingFinished, speechRecognized{text,confidence}, error{message}.
# Depends : Windows PowerShell 5.1, System.Speech (built in). No admin needed.
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$script:recognizer = $null

function Send-Event($eventObject) { [Console]::Out.WriteLine(($eventObject | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

function Start-Recognizing {
    if ($script:recognizer) { return }
    $script:recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $script:recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
    $script:recognizer.SetInputToDefaultAudioDevice()
    $null = Register-ObjectEvent $script:recognizer SpeechRecognized -SourceIdentifier 'recognized'
    $script:recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
}

function Stop-Recognizing {
    if (-not $script:recognizer) { return }
    $script:recognizer.RecognizeAsyncCancel()
    Unregister-Event -SourceIdentifier 'recognized' -ErrorAction SilentlyContinue
    $script:recognizer.Dispose(); $script:recognizer = $null
}

$null = Register-ObjectEvent $synthesizer SpeakCompleted -SourceIdentifier 'speakCompleted'
$standardInputReader = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()) # Console.In.ReadLineAsync blocks synchronously
$inputTask = $standardInputReader.ReadLineAsync()
Send-Event @{ type = 'ready' }
$isRunning = $true

while ($isRunning) {
    foreach ($recognizedEvent in @(Get-Event -SourceIdentifier 'recognized' -ErrorAction SilentlyContinue)) {
        $result = $recognizedEvent.SourceEventArgs.Result
        Send-Event @{ type = 'speechRecognized'; text = $result.Text; confidence = [math]::Round($result.Confidence, 2) }
        Remove-Event -EventIdentifier $recognizedEvent.EventIdentifier
    }
    foreach ($completedEvent in @(Get-Event -SourceIdentifier 'speakCompleted' -ErrorAction SilentlyContinue)) {
        Remove-Event -EventIdentifier $completedEvent.EventIdentifier
        Send-Event @{ type = 'speakingFinished' }
    }
    if (-not $inputTask.IsCompleted) { Start-Sleep -Milliseconds 40; continue }
    $line = $inputTask.Result
    if ($null -eq $line) { break }
    $inputTask = $standardInputReader.ReadLineAsync()
    try {
        $command = $line | ConvertFrom-Json
        switch ($command.type) {
            'speak' { Send-Event @{ type = 'speakingStarted' }; $null = $synthesizer.SpeakAsync([string]$command.text) }
            'stopSpeaking' { $synthesizer.SpeakAsyncCancelAll() }
            'listVoices' { Send-Event @{ type = 'voices'; voiceNames = @($synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) } }
            'setVoice' { $synthesizer.SelectVoice([string]$command.voiceName) }
            'startRecognizing' { Start-Recognizing }
            'stopRecognizing' { Stop-Recognizing }
            'quit' { $isRunning = $false }
        }
    } catch { Send-Event @{ type = 'error'; message = $_.Exception.Message } }
}
Stop-Recognizing
$synthesizer.Dispose()
[Environment]::Exit(0) # the pending stdin read would otherwise keep the process alive
