// run-conversation-loop.test.ts
// Purpose : Verifies the hands-free cycle, silence auto-send, approvals, destructive confirmation and barge-in with fakes.
// Inputs  : none. Outputs: node:test results.
// Depends : source/voice-engine/run-conversation-loop.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runConversationLoop, type SpeechEngine } from '../source/voice-engine/run-conversation-loop.ts';
import type { TargetAdapter, TargetAdapterEvent } from '../source/target-adapters/target-adapter.interface.ts';
import { loadConfiguration } from '../source/shared/load-configuration.ts';

function createFakes() {
  const configuration = { ...loadConfiguration(), silenceTimeoutSeconds: 0.03 };
  const log: string[] = [];
  let emitAdapterEvent: (event: TargetAdapterEvent) => void = () => {};
  let recognized: (text: string, confidence: number) => void = () => {};
  let speakingFinished: () => void = () => {};
  const adapter: TargetAdapter = {
    startAdapter: async () => {}, stopAdapter: async () => {}, abortTurn: async () => {},
    sendPrompt: async (text) => { log.push(`send:${text}`); },
    respondToApproval: (shouldApprove) => { log.push(`approval:${shouldApprove}`); },
    onEvent: (listener) => { emitAdapterEvent = listener; },
  };
  const speech: SpeechEngine = {
    speak: (text) => log.push(`speak:${text}`), stopSpeaking: () => log.push('stopSpeaking'),
    startRecognizing: () => log.push('listen'), stopRecognizing: () => log.push('mute'),
    onRecognized: (listener) => { recognized = listener; }, onSpeakingFinished: (listener) => { speakingFinished = listener; },
  };
  const loop = runConversationLoop(adapter, speech, configuration);
  return { loop, log, configuration, say: (text: string) => recognized(text, 0.95), finishSpeaking: () => speakingFinished(), emit: (event: TargetAdapterEvent) => emitAdapterEvent(event) };
}
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('silence auto-sends, answer is spoken, loop returns to listening', async () => {
  const { loop, log, say, emit, finishSpeaking } = createFakes();
  loop.toggleListening();
  say('list the files');
  await wait(150);
  assert.ok(log.includes('send:list the files'));
  emit({ type: 'answerDelta', text: 'Two files. ' });
  emit({ type: 'turnCompleted' });
  assert.deepEqual(log.filter((entry) => entry.startsWith('speak:')), ['speak:Answer.']);
  finishSpeaking(); finishSpeaking();
  assert.equal(loop.getState(), 'listening');
});

test('empty transcript is never sent', async () => {
  const { loop, log } = createFakes();
  loop.toggleListening();
  loop.toggleListening();
  assert.equal(log.some((entry) => entry.startsWith('send:')), false);
  assert.equal(loop.getState(), 'idle');
});

test('safe approval by voice; destructive approval needs the confirmation phrase', () => {
  const { loop, log, say, emit, finishSpeaking } = createFakes();
  emit({ type: 'approvalRequested', summary: 'shell: git status', isDestructive: false });
  finishSpeaking(); say('approve');
  assert.ok(log.includes('approval:true'));
  emit({ type: 'approvalRequested', summary: 'shell: rm -rf x', isDestructive: true });
  finishSpeaking(); say('approve');
  assert.equal(log.filter((entry) => entry.startsWith('approval:')).length, 1);
  assert.equal(loop.getState(), 'confirmingDestructive');
  finishSpeaking(); say('yes I confirm');
  assert.equal(log.filter((entry) => entry === 'approval:true').length, 2);
});

test('hotkey while speaking barges in and listens', () => {
  const { loop, log, emit } = createFakes();
  loop.toggleListening(); loop.toggleListening();
  log.length = 0;
  (loop as unknown as { getState(): string }).getState();
  emit({ type: 'turnCompleted' });
  assert.equal(loop.getState(), 'listening');
});

test('hotkey during reasoning skips to the answer', async () => {
  const { loop, log, emit, say } = createFakes();
  loop.toggleListening(); say('hello'); loop.toggleListening();
  await wait(20);
  emit({ type: 'reasoningDelta', text: 'First thought. Second thought. ' });
  assert.equal(loop.getState(), 'speaking');
  loop.toggleListening();
  assert.ok(log.includes('stopSpeaking'));
  assert.equal(loop.getState(), 'speaking');
});
