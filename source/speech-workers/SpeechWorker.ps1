# SpeechWorker.ps1
# Purpose : Long-lived Windows speech worker: speaks text, lists voices, recognizes dictation.
# Inputs  : JSON lines on stdin: speak{text} | stopSpeaking | listVoices | setVoice{voiceName} | registerHotkey{modifiers,keyCode} | startRecognizing | stopRecognizing | quit
# Outputs : JSON lines on stdout: ready, voices{voiceNames}, hotkeyRegistered{isRegistered}, hotkeyPressed, speakingStarted, speakingFinished, speechRecognized{text,confidence}, error{message}.
# Depends : Windows PowerShell 5.1, System.Speech and System.Windows.Forms (built in). No admin needed.
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System; using System.Collections.Concurrent; using System.Runtime.InteropServices; using System.Threading; using System.Windows.Forms;
public class HotkeyListener : NativeWindow {
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint key);
    public static ConcurrentQueue<string> Pressed = new ConcurrentQueue<string>();
    public static bool IsRegistered;
    public static void Start(uint modifiers, uint key) {
        var ready = new ManualResetEvent(false);
        var thread = new Thread(() => {
            var window = new HotkeyListener(); window.CreateHandle(new CreateParams());
            IsRegistered = RegisterHotKey(window.Handle, 1, modifiers, key); ready.Set(); Application.Run();
        }); thread.IsBackground = true; thread.SetApartmentState(ApartmentState.STA); thread.Start(); ready.WaitOne();
    }
    protected override void WndProc(ref Message m) { if (m.Msg == 0x0312) Pressed.Enqueue("hotkey"); base.WndProc(ref m); }
}
'@
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
    $pressedName = $null
    while ([HotkeyListener]::Pressed.TryDequeue([ref]$pressedName)) { Send-Event @{ type = 'hotkeyPressed' } }
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
            'beep' { [Console]::Beep(988, 120) }
            'stopSpeaking' { $synthesizer.SpeakAsyncCancelAll() }
            'listVoices' { Send-Event @{ type = 'voices'; voiceNames = @($synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) } }
            'setVoice' { $synthesizer.SelectVoice([string]$command.voiceName) }
            'registerHotkey' { [HotkeyListener]::Start([uint32]$command.modifiers, [uint32]$command.keyCode); Send-Event @{ type = 'hotkeyRegistered'; isRegistered = [HotkeyListener]::IsRegistered } }
            'startRecognizing' { Start-Recognizing }
            'stopRecognizing' { Stop-Recognizing }
            'quit' { $isRunning = $false }
        }
    } catch { Send-Event @{ type = 'error'; message = $_.Exception.Message } }
}
Stop-Recognizing
$synthesizer.Dispose()
[Environment]::Exit(0) # the pending stdin read would otherwise keep the process alive
