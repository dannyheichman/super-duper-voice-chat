// speech-worker-client.ts
// Purpose : Spawns SpeechWorker.ps1 and exposes typed send/wait helpers over its JSON-lines protocol.
// Inputs  : worker script path; commands via sendCommand().
// Outputs : worker events via waitForEvent(type, timeoutSeconds) and the onEvent listener.
// Depends : node:child_process, node:readline, node:events.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface SpeechWorkerEvent { readonly type: string; readonly [key: string]: unknown }

export interface SpeechWorkerClient {
  onEvent(listener: (event: SpeechWorkerEvent) => void): void;
  sendCommand(command: { type: string; [key: string]: unknown }): void;
  waitForEvent(expectedType: string, timeoutSeconds: number): Promise<SpeechWorkerEvent>;
  stopWorker(): Promise<void>;
}

export function startSpeechWorker(workerScriptPath: string): SpeechWorkerClient {
  const workerProcess = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', workerScriptPath],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const receivedEvents: SpeechWorkerEvent[] = [];
  const waiters: Array<() => void> = [];
  let eventListener: ((event: SpeechWorkerEvent) => void) | undefined;
  createInterface({ input: workerProcess.stdout }).on('line', (line) => {
    const jsonStart = line.indexOf('{');
    if (jsonStart === -1) return;
    const event = JSON.parse(line.slice(jsonStart)) as SpeechWorkerEvent;
    const isStreamingEvent = ['speechRecognized', 'speakingFinished', 'hotkeyPressed', 'error'].includes(event.type);
    if (eventListener && isStreamingEvent) { eventListener(event); return; }
    receivedEvents.push(event);
    waiters.splice(0).forEach((wake) => wake());
  });

  async function waitForEvent(expectedType: string, timeoutSeconds: number): Promise<SpeechWorkerEvent> {
    const deadlineMilliseconds = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadlineMilliseconds) {
      const matchIndex = receivedEvents.findIndex((event) => event.type === expectedType);
      if (matchIndex !== -1) return receivedEvents.splice(matchIndex, 1)[0];
      await new Promise<void>((wake) => { waiters.push(wake); setTimeout(wake, 200); });
    }
    throw new Error(`Timed out after ${timeoutSeconds}s waiting for "${expectedType}"; pending: ${JSON.stringify(receivedEvents)}`);
  }

  return {
    onEvent: (listener) => { eventListener = listener; },
    sendCommand: (command) => { workerProcess.stdin.write(`${JSON.stringify(command)}\n`); },
    waitForEvent,
    async stopWorker() {
      workerProcess.stdin.write('{"type":"quit"}\n');
      await new Promise<void>((done) => { workerProcess.once('exit', () => done()); setTimeout(() => { workerProcess.kill(); done(); }, 5000); });
    },
  };
}
