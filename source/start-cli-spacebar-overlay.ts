// start-cli-spacebar-overlay.ts
// Purpose : Launch the CLI spacebar overlay reader attached to an active session.
// Inputs  : --session-id <UUID> or auto-detect from ~/.copilot/session-state/ (latest).
// Outputs : Reads aloud reasoning + answer as you hold spacebar in the CLI.
// Depends : cli-spacebar-reader.ts, speech-worker-client.ts.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runCliSpacebarReader } from './overlay/cli-spacebar-reader.ts';
import { startSpeechWorker } from './voice-engine/speech-worker-client.ts';

async function main() {
  const sessionArg = process.argv.indexOf('--session-id') >= 0 ? process.argv[process.argv.indexOf('--session-id') + 1] : '';

  let sessionId = sessionArg;
  if (!sessionId) {
    const sessionDir = join(homedir(), '.copilot', 'session-state');
    const sessions = readdirSync(sessionDir)
      .filter((f) => f.length === 36 && !f.includes('.'))
      .map((f) => ({ id: f, time: statSync(join(sessionDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (sessions.length === 0) { console.error('No sessions found'); process.exit(1); }
    sessionId = sessions[0].id;
  }

  console.log('[cli-spacebar-overlay] Starting with session', sessionId);
  const workerClient = startSpeechWorker(join(process.cwd(), 'source/speech-workers/SpeechWorker.ps1'));
  const speakCommand = async (text: string) => workerClient.sendCommand({ type: 'speak', text });
  await runCliSpacebarReader(sessionId, speakCommand);
}

main().catch((err) => { console.error(err); process.exit(1); });
