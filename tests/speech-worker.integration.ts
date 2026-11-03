// speech-worker.integration.ts
// Purpose : Real-audio-device smoke test of SpeechWorker.ps1 through speech-worker-client (run manually: npm run test:worker).
// Inputs  : none. Outputs: PASS lines; throws on first failure.
// Depends : source/voice-engine/speech-worker-client.ts, Windows speech voices.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startSpeechWorker } from '../source/voice-engine/speech-worker-client.ts';

const worker = startSpeechWorker(fileURLToPath(new URL('../source/speech-workers/SpeechWorker.ps1', import.meta.url)));
try {
  await worker.waitForEvent('ready', 60);
  console.log('PASS ready');
  worker.sendCommand({ type: 'listVoices' });
  const voices = await worker.waitForEvent('voices', 10);
  assert.ok((voices.voiceNames as string[]).length > 0);
  console.log('PASS voices:', voices.voiceNames);
  worker.sendCommand({ type: 'speak', text: 'Voice worker test.' });
  await worker.waitForEvent('speakingStarted', 5);
  await worker.waitForEvent('speakingFinished', 15);
  console.log('PASS speak start and finish');
  worker.sendCommand({ type: 'speak', text: 'This long sentence should be cancelled before it finishes speaking out loud.' });
  await worker.waitForEvent('speakingStarted', 5);
  const cancelStartedMilliseconds = Date.now();
  worker.sendCommand({ type: 'stopSpeaking' });
  await worker.waitForEvent('speakingFinished', 3);
  console.log(`PASS barge-in stop in ${Date.now() - cancelStartedMilliseconds} ms`);
  worker.sendCommand({ type: 'registerHotkey', modifiers: 0x4000 | 2 | 1, keyCode: 0x7b }); // Ctrl+Alt+F12
  const hotkeyStatus = await worker.waitForEvent('hotkeyRegistered', 10);
  console.log(hotkeyStatus.isRegistered ? 'PASS hotkey registered' : 'WARN hotkey Ctrl+Alt+F12 already taken');
} finally {
  await worker.stopWorker();
  console.log('worker stopped');
}
