# super-duper-voice-chat

Hands-free voice chat for GitHub Copilot CLI. Speech-to-text and text-to-speech run locally; only the prompt text goes to Copilot.

## Setup (Windows, no admin)
```powershell
npm install
New-Item -ItemType Directory -Force models | Out-Null
curl.exe -L -o models\m.tar.bz2 https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2
tar -xjf models\m.tar.bz2 -C models; Remove-Item models\m.tar.bz2
npm start                       # Copilot CLI target, model claude-haiku-4.5
npm start -- --model claude-sonnet-5.5
npm start -- --target vscode    # prompt-only: sends text with `code chat`, no read-back
```
Log in to Copilot first (run `copilot` once, or set `GH_TOKEN`). Stop with Ctrl+C.

## Use
- Hotkey (default **Ctrl+Alt+Q**, set in `config/voice-chat.config.json`): start listening (you hear a cue); press again to send; press during read-back to interrupt; press during reasoning read-back to skip to the answer.
- Listening stops after `silenceTimeoutSeconds` of quiet. The first phrase gets 3x that time, and there is no limit before you start talking.
- Dictation commands: "send it", "scratch that", "hold on", "cancel".
- Approvals: "approve", "deny", "repeat that". Destructive commands need the exact phrase "yes I confirm".

## Tests
`npm test` (unit), `npm run test:worker` (real audio device), `node tests/copilot-adapter.live.ts` (spends credits), `tests/Run-VoiceScenario.ps1` (unattended; unreliable through speakers).

See `AGENTS.md` for architecture and conventions.
