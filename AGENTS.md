# AGENTS.md — super-duper-voice-chat

Hands-free voice loop for GitHub Copilot CLI / VS Code. Full design: PLAN.md (in the planning folder; copy it here at M0 finish).

## Architecture
- `source/voice-engine/` — speech loop logic. Imports only `shared/` and the `TargetAdapter` interface; never a specific target.
- `source/target-adapters/` (not built yet) — one file per target (Copilot SDK, VS Code, ACP). Never import the engine.
- `source/speech-workers/` (not built yet) — `SpeechWorker.ps1` (System.Speech + SAPI + hotkey) speaking JSON lines over stdio.
- `config/` — behavior as data. Prefer editing JSON over adding code.

## Conventions
- Node 26 runs `.ts` directly: no enums, namespaces, or parameter properties (`erasableSyntaxOnly`). Imports end in `.ts`.
- Verb-first functions, units in names (`silenceTimeoutSeconds`), booleans `is/has/should`, no abbreviations, file name = single responsibility.
- Every file starts with a 3–5 line header: purpose, inputs/outputs, dependencies. File ≤ 200 lines, function ≤ 40.
- Local-only: never add cloud STT/TTS or send audio/response text off-machine.

## Safe changes
- Run `npm test` and `npm run typecheck` before finishing. Add a test for each new rule in `tests/`.
- Destructive approvals must always require `destructiveConfirmationPhrase`.

## Status
Done: M0 scaffold, config loader, sentence splitter, read-aloud filter (+tests); M1 `SpeechWorker.ps1` + `speech-worker-client.ts` (verified with `npm run test:worker`: speak, cancel/barge-in 152 ms; dictation/recognition events not yet verified with a real microphone).
M2 `copilot-cli-sdk-adapter.ts` (live-verified with `node tests/copilot-adapter.live.ts`: streamed answer + turnCompleted; reasoning and approval events not yet exercised).
M3/M4 core: `run-conversation-loop.ts` + `interpret-voice-command.ts` (fake-tested: silence auto-send, half-duplex, approvals, destructive confirmation phrase).
Next: `start-voice-chat.ts` entry wiring (worker + SDK adapter + loop), global hotkey in SpeechWorker.ps1 (RegisterHotKey), SpeechEngine adapter over speech-worker-client, real-microphone dictation test, hang timeout/abort (M6), VS Code adapter (M8).
Gotchas: in Windows PowerShell 5.1 `[Console]::In.ReadLineAsync()` blocks; use a `StreamReader` over `OpenStandardInput()`. The worker takes ~10–60 s to emit `ready` on first start.
Tooling: `gh` is at `C:\Program Files\GitHub CLI\gh.exe` (authenticated; `gh auth setup-git` done), so `git push` works non-interactively.

- Status: M0-M4 plus global hotkey and start-voice-chat.ts done and pushed (10/10 unit tests). Still untested: real-mic dictation, SDK permission/reasoning event shapes. Missing: hang timeout, holdOn, repeat/skip commands, VS Code adapter.

- Speech-to-text now uses local sherpa-onnx (source/voice-engine/recognize-speech-locally.ts + MicCapture.ps1). Model lives in models/ (gitignored): sherpa-onnx-streaming-zipformer-en-20M-2023-02-17 from the k2-fsa/sherpa-onnx asr-models release. Default Copilot model is claude-haiku-4.5.

- Status: hotkey is Ctrl+Alt+Q (Ctrl+Shift+W closes Windows Terminal tabs; Win+Q/Win+W cannot be registered). Silence timer resets on live speech. Hang timeout and repeat-during-approval done. Unattended tests: tests/Run-VoiceScenario.ps1 (synthetic speech is unreliable through the mic). Still missing: hold-on, skip-reasoning, VS Code adapter, real permission-event verification.

- VS Code adapter (prompt-only, uses 'code chat'): npm start -- --target vscode. Untested; replies are not read back.

- Verified live: SDK permission requests have kind='shell', fullCommandText (string), intention, commands[]; reasoning events (assistant.reasoning) are emitted for claude-haiku-4.5. Check: node tests/permission-shape.live.ts

- Hotkey during reasoning read-back skips to the answer. VS Code replies are not read back (prompt-only adapter). Summarizing middleman idea not built.

## Add a target (recipe)
1. Create source/target-adapters/<name>-adapter.ts exporting createXAdapter(): TargetAdapter (see target-adapter.interface.ts; emit reasoningDelta/answerDelta/approvalRequested/turnCompleted/turnFailed).
2. Add a branch for it in source/start-voice-chat.ts (--target <name>).
3. Add a live check in tests/<name>-adapter.live.ts. Existing targets: copilot-sdk (default), copilot-acp (live-verified, generic ACP over stdio), vscode (prompt-only).

- Status: all milestones M0-M9 built. Not built: VS Code reply read-back, Whisper tier, summarizing middleman.
