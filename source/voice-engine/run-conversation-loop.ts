// run-conversation-loop.ts
// Purpose : State machine: idle > listening > sending > waiting > speaking > (awaitingApproval) > listening, hands-free.
// Inputs  : TargetAdapter, SpeechEngine, VoiceChatConfiguration; toggleListening() from the hotkey.
// Outputs : calls speech.speak/startRecognizing/stopRecognizing and adapter.sendPrompt/respondToApproval/abortTurn.
// Depends : target-adapter.interface.ts, split-stream-into-sentences.ts, filter-text-for-read-aloud.ts, interpret-voice-command.ts.
import type { TargetAdapter, TargetAdapterEvent } from '../target-adapters/target-adapter.interface.ts';
import type { VoiceChatConfiguration } from '../shared/load-configuration.ts';
import { createSentenceSplitter } from './split-stream-into-sentences.ts';
import { filterTextForReadAloud } from './filter-text-for-read-aloud.ts';
import { interpretVoiceCommand } from './interpret-voice-command.ts';

export interface SpeechEngine {
  speak(text: string): void;
  stopSpeaking(): void;
  startRecognizing(): void;
  stopRecognizing(): void;
  onRecognized(listener: (text: string, confidence: number) => void): void;
  onSpeakingFinished(listener: () => void): void;
  onSpeechActivity?(listener: () => void): void;
}

export type ConversationState = 'idle' | 'listening' | 'sending' | 'waiting' | 'speaking' | 'awaitingApproval' | 'confirmingDestructive';

export interface ConversationLoop {
  toggleListening(): void;
  getState(): ConversationState;
}

export function runConversationLoop(adapter: TargetAdapter, speech: SpeechEngine, configuration: VoiceChatConfiguration): ConversationLoop {
  let state: ConversationState = 'idle';
  let draftText = '';
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let turnHangTimer: ReturnType<typeof setTimeout> | undefined;
  let isReasoningSkipped = false;
  let lastSpokenText = '';
  let isTurnCompleted = false;
  let isSpeakingNow = false;
  let lastSpokenKind: 'reasoning' | 'answer' | undefined;
  let pendingApprovalIsDestructive = false;
  const spokenQueue: string[] = [];
  const splitters = { reasoning: createSentenceSplitter(), answer: createSentenceSplitter() };

  function setState(nextState: ConversationState): void { state = nextState; }

  function startListening(): void {
    clearTimeout(silenceTimer);
    draftText = '';
    setState('listening');
    speech.startRecognizing();
  }

  function sendDraft(): void {
    clearTimeout(silenceTimer);
    speech.stopRecognizing();
    const promptText = draftText.trim();
    if (promptText.length === 0) { setState('idle'); return; } // an empty transcript is never sent
    setState('sending');
    isTurnCompleted = false;
    lastSpokenKind = undefined;
    isReasoningSkipped = false;
    restartTurnHangTimer();
    adapter.sendPrompt(promptText).then(() => { if (state === 'sending') setState('waiting'); })
      .catch(() => { enqueueSpeech('Could not reach Copilot.'); isTurnCompleted = true; });
  }

  function enqueueSpeech(text: string): void {
    const { spokenText } = filterTextForReadAloud(text, configuration.maximumSpokenCharactersPerTurn);
    if (spokenText.length > 0) spokenQueue.push(spokenText);
    if (!isSpeakingNow) speakNext();
  }

  function speakNext(): void {
    const nextText = spokenQueue.shift();
    if (nextText === undefined) { onSpeechQueueDrained(); return; }
    isSpeakingNow = true;
    speech.stopRecognizing(); // half-duplex: never listen to ourselves
    if (state === 'waiting') setState('speaking');
    lastSpokenText = nextText;
    speech.speak(nextText);
  }

  function onSpeechQueueDrained(): void {
    isSpeakingNow = false;
    if (state === 'awaitingApproval' || state === 'confirmingDestructive') speech.startRecognizing();
    else if (isTurnCompleted) startListening();
  }

  function speakDelta(kind: 'reasoning' | 'answer', text: string): void {
    if (kind === 'reasoning' && (!configuration.shouldReadReasoningAloud || isReasoningSkipped)) return;
    if (lastSpokenKind !== kind) {
      splitters[lastSpokenKind ?? kind].flush().forEach(enqueueSpeech);
      enqueueSpeech(kind === 'reasoning' ? 'Thinking.' : 'Answer.');
      lastSpokenKind = kind;
    }
    splitters[kind].pushDelta(text).forEach(enqueueSpeech);
  }

  function restartTurnHangTimer(): void {
    clearTimeout(turnHangTimer);
    turnHangTimer = setTimeout(() => {
      adapter.abortTurn().catch(() => {});
      enqueueSpeech('Copilot stopped responding. The turn was cancelled.');
      isTurnCompleted = true;
      if (!isSpeakingNow) startListening();
    }, configuration.turnIdleTimeoutSeconds * 1000);
    turnHangTimer.unref(); // never keep the process (or tests) alive just for this timer
  }

  function handleAdapterEvent(event: TargetAdapterEvent): void {
    if (event.type === 'turnCompleted' || event.type === 'turnFailed') clearTimeout(turnHangTimer);
    else if (event.type !== 'approvalRequested') restartTurnHangTimer();
    else clearTimeout(turnHangTimer); // waiting for the human, not hung
    if (event.type === 'reasoningDelta') speakDelta('reasoning', event.text);
    else if (event.type === 'answerDelta') speakDelta('answer', event.text);
    else if (event.type === 'approvalRequested') {
      pendingApprovalIsDestructive = event.isDestructive;
      setState('awaitingApproval');
      enqueueSpeech(`Copilot wants permission. ${event.summary}. Say approve or deny.`);
    } else if (event.type === 'turnCompleted' || event.type === 'turnFailed') {
      if (event.type === 'turnFailed') enqueueSpeech(`Copilot failed. ${event.message}`);
      splitters.reasoning.flush().forEach(enqueueSpeech);
      splitters.answer.flush().forEach(enqueueSpeech);
      isTurnCompleted = true;
      if (!isSpeakingNow) startListening();
    }
  }

  function handleRecognized(text: string, confidence: number): void {
    if (confidence < configuration.minimumCommandConfidence && state !== 'listening') return;
    const command = interpretVoiceCommand(text, state, configuration.destructiveConfirmationPhrase);
    if (state === 'listening') {
      if (command === 'sendNow') return sendDraft();
      if (command === 'cancelAll') { clearTimeout(silenceTimer); speech.stopRecognizing(); return setState('idle'); }
      if (command === 'scratchThat') { draftText = ''; return; }
      if (command === 'holdOn') { clearTimeout(silenceTimer); return; } // pause auto-send until the next phrase
      const isFirstPhrase = draftText.trim().length === 0;
      draftText += ` ${text}`;
      clearTimeout(silenceTimer);
      const graceSeconds = isFirstPhrase ? configuration.silenceTimeoutSeconds * 3 : configuration.silenceTimeoutSeconds; // extra time to think after the first phrase
      silenceTimer = setTimeout(sendDraft, graceSeconds * 1000);
    } else if (state === 'awaitingApproval') {
      if (command === 'repeatThat') { enqueueSpeech(lastSpokenText); return; }
      if (command === 'approve' && pendingApprovalIsDestructive) {
        setState('confirmingDestructive');
        enqueueSpeech(`This looks destructive. Say ${configuration.destructiveConfirmationPhrase} or deny.`);
      } else if (command === 'approve' || command === 'deny' || command === 'cancelAll') resolveApproval(command === 'approve');
    } else if (state === 'confirmingDestructive') {
      if (command === 'confirmDestructive') resolveApproval(true);
      else if (command === 'deny') resolveApproval(false);
    }
  }

  function resolveApproval(shouldApprove: boolean): void {
    speech.stopRecognizing();
    setState('waiting');
    restartTurnHangTimer();
    adapter.respondToApproval(shouldApprove);
  }

  adapter.onEvent(handleAdapterEvent);
  speech.onRecognized(handleRecognized);
  speech.onSpeakingFinished(speakNext);
  speech.onSpeechActivity?.(() => { if (state === 'listening') clearTimeout(silenceTimer); }); // still talking: do not send yet

  return {
    getState: () => state,
    toggleListening(): void {
      if (state === 'idle') startListening();
      else if (state === 'listening') sendDraft();
      else if (state === 'speaking' && lastSpokenKind === 'reasoning' && !isTurnCompleted) { // hotkey during reasoning: skip to the answer
        isReasoningSkipped = true;
        const answerIndex = spokenQueue.indexOf('Answer.');
        spokenQueue.splice(0, answerIndex === -1 ? spokenQueue.length : answerIndex);
        speech.stopSpeaking();
      }
      else if (state === 'speaking') { spokenQueue.length = 0; speech.stopSpeaking(); isSpeakingNow = false; isTurnCompleted = true; startListening(); }
    },
  };
}
