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
Done: M0 scaffold, config loader, sentence splitter, read-aloud filter (+tests).
Next: M1 SpeechWorker.ps1, M2 Copilot SDK adapter (`npm i @github/copilot-sdk`), M3 conversation loop.
