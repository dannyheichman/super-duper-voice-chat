// start-voice-chat.ts
// Purpose : Entry point: starts the speech worker and Copilot SDK adapter, registers the hotkey, runs the loop.
// Inputs  : config/voice-chat.config.json; optional --model <name> (default claude-sonnet-5.5).
// Outputs : spoken conversation; console status lines; Ctrl+C stops cleanly.
// Depends : load-configuration, speech-worker-client, copilot-cli-sdk-adapter, run-conversation-loop.
import { fileURLToPath } from 'node:url';
import { loadConfiguration } from './shared/load-configuration.ts';
import { startSpeechWorker } from './voice-engine/speech-worker-client.ts';
import { createCopilotCliSdkAdapter } from './target-adapters/copilot-cli-sdk-adapter.ts';
import { startMicrophoneRecognition } from './voice-engine/recognize-speech-locally.ts';
import { runConversationLoop, type SpeechEngine } from './voice-engine/run-conversation-loop.ts';

const modifierBitsByName: Record<string, number> = { Alt: 1, Ctrl: 2, Shift: 4, Win: 8 };

function parseHotkey(hotkeyText: string): { modifiers: number; keyCode: number } {
  const parts = hotkeyText.split('+');
  const keyName = parts.pop()!;
  const modifiers = parts.reduce((bits, name) => bits | modifierBitsByName[name], 0x4000); // MOD_NOREPEAT
  const functionKeyNumber = /^F(\d{1,2})$/i.exec(keyName)?.[1];
  const keyCode = keyName === 'Space' ? 0x20 : functionKeyNumber ? 0x6f + Number(functionKeyNumber) : keyName.toUpperCase().charCodeAt(0);
  return { modifiers, keyCode };
}

const configuration = loadConfiguration();
const modelName = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'claude-haiku-4.5';
const worker = startSpeechWorker(fileURLToPath(new URL('./speech-workers/SpeechWorker.ps1', import.meta.url)));
const baseAdapter = createCopilotCliSdkAdapter(modelName);
let lastPrintedKind = '';
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  sendPrompt: (promptText) => { console.log(`\nyou: ${promptText}`); lastPrintedKind = ''; return baseAdapter.sendPrompt(promptText); },
  onEvent: (listener) => baseAdapter.onEvent((event) => {
    if (event.type === 'reasoningDelta' || event.type === 'answerDelta') {
      if (event.type !== lastPrintedKind) { process.stdout.write(`\n${event.type === 'reasoningDelta' ? 'thinking' : 'copilot'}: `); lastPrintedKind = event.type; }
      process.stdout.write(event.text);
    } else { lastPrintedKind = ''; console.log(`\n[${event.type}]`); }
    listener(event);
  }),
};
let recognizedListener: (text: string, confidence: number) => void = () => {};
let speakingFinishedListener: () => void = () => {};

const microphone = startMicrophoneRecognition(
  fileURLToPath(new URL('../models/sherpa-onnx-streaming-zipformer-en-2023-06-26', import.meta.url)),
  fileURLToPath(new URL('./speech-workers/MicCapture.ps1', import.meta.url)),
  (text) => { console.log('heard:', text); recognizedListener(text, 1); },
);

const speechEngine: SpeechEngine = {
  speak: (text) => worker.sendCommand({ type: 'speak', text }),
  stopSpeaking: () => worker.sendCommand({ type: 'stopSpeaking' }),
  startRecognizing: () => { microphone.setIsListening(true); worker.sendCommand({ type: 'beep' }); },
  stopRecognizing: () => microphone.setIsListening(false),
  onRecognized: (listener) => { recognizedListener = listener; },
  onSpeakingFinished: (listener) => { speakingFinishedListener = listener; },
};

worker.onEvent((event) => {
  if (event.type === 'speakingFinished') speakingFinishedListener();
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

process.on('SIGINT', async () => { microphone.stop(); await adapter.stopAdapter(); await worker.stopWorker(); process.exit(0); });
