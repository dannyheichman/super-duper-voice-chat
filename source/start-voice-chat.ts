// start-voice-chat.ts
// Purpose : Entry point: starts the speech worker and Copilot SDK adapter, registers the hotkey, runs the loop.
// Inputs  : config/voice-chat.config.json; optional --model <name> (default claude-sonnet-5.5).
// Outputs : spoken conversation; console status lines; Ctrl+C stops cleanly.
// Depends : load-configuration, speech-worker-client, copilot-cli-sdk-adapter, run-conversation-loop.
import { fileURLToPath } from 'node:url';
import { loadConfiguration } from './shared/load-configuration.ts';
import { startSpeechWorker } from './voice-engine/speech-worker-client.ts';
import { createCopilotCliSdkAdapter } from './target-adapters/copilot-cli-sdk-adapter.ts';
import { runConversationLoop, type SpeechEngine } from './voice-engine/run-conversation-loop.ts';

const modifierBitsByName: Record<string, number> = { Alt: 1, Ctrl: 2, Shift: 4, Win: 8 };

function parseHotkey(hotkeyText: string): { modifiers: number; keyCode: number } {
  const parts = hotkeyText.split('+');
  const keyName = parts.pop()!;
  const modifiers = parts.reduce((bits, name) => bits | modifierBitsByName[name], 0x4000); // MOD_NOREPEAT
  const keyCode = keyName === 'Space' ? 0x20 : keyName.toUpperCase().charCodeAt(0);
  return { modifiers, keyCode };
}

const configuration = loadConfiguration();
const modelName = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'claude-sonnet-5.5';
const worker = startSpeechWorker(fileURLToPath(new URL('./speech-workers/SpeechWorker.ps1', import.meta.url)));
const adapter = createCopilotCliSdkAdapter(modelName);
let recognizedListener: (text: string, confidence: number) => void = () => {};
let speakingFinishedListener: () => void = () => {};

const speechEngine: SpeechEngine = {
  speak: (text) => worker.sendCommand({ type: 'speak', text }),
  stopSpeaking: () => worker.sendCommand({ type: 'stopSpeaking' }),
  startRecognizing: () => worker.sendCommand({ type: 'startRecognizing' }),
  stopRecognizing: () => worker.sendCommand({ type: 'stopRecognizing' }),
  onRecognized: (listener) => { recognizedListener = listener; },
  onSpeakingFinished: (listener) => { speakingFinishedListener = listener; },
};

worker.onEvent((event) => {
  if (event.type === 'speechRecognized') { console.log('heard:', event.text); recognizedListener(String(event.text), Number(event.confidence)); }
  else if (event.type === 'speakingFinished') speakingFinishedListener();
  else if (event.type === 'hotkeyPressed') loop.toggleListening();
  else if (event.type === 'error') console.error('worker error:', event.message);
});

const loop = runConversationLoop(adapter, speechEngine, configuration);
await worker.waitForEvent('ready', 90);
worker.sendCommand({ type: 'setVoice', voiceName: configuration.voiceName });
worker.sendCommand({ type: 'registerHotkey', ...parseHotkey(configuration.hotkey) });
const hotkeyStatus = await worker.waitForEvent('hotkeyRegistered', 10);
if (!hotkeyStatus.isRegistered) console.error(`Hotkey ${configuration.hotkey} is already in use; change it in config/voice-chat.config.json`);
await adapter.startAdapter();
console.log(`Ready. Press ${configuration.hotkey} to talk (model ${modelName}). Ctrl+C to quit.`);
worker.sendCommand({ type: 'speak', text: 'Voice chat ready.' });

process.on('SIGINT', async () => { await adapter.stopAdapter(); await worker.stopWorker(); process.exit(0); });
