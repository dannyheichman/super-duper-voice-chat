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
