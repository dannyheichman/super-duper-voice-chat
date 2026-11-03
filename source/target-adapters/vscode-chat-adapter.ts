// vscode-chat-adapter.ts
// Purpose : Prompt-only adapter for VS Code Copilot Chat: sends spoken prompts with `code chat`; the reply stays in VS Code (not read back).
// Inputs  : prompt text from the conversation loop.
// Outputs : TargetAdapterEvent 'answerDelta' (a short spoken acknowledgement) then 'turnCompleted'.
// Depends : the `code` command on PATH, node:child_process. Response capture needs a future extension or ACP adapter.
import { execFile } from 'node:child_process';
import type { TargetAdapter, TargetAdapterEvent } from './target-adapter.interface.ts';

export function createVsCodeChatAdapter(): TargetAdapter {
  let eventListener: (event: TargetAdapterEvent) => void = () => {};
  const emit = (event: TargetAdapterEvent) => eventListener(event);
  return {
    startAdapter: async () => {},
    stopAdapter: async () => {},
    abortTurn: async () => {},
    sendPrompt: (promptText) => new Promise<void>((resolve) => {
      execFile('code', ['chat', '--mode', 'agent', promptText], { shell: true }, (error) => {
        if (error) emit({ type: 'turnFailed', message: 'Could not run the code command.' });
        else { emit({ type: 'answerDelta', text: 'Sent to VS Code Copilot Chat. ' }); emit({ type: 'turnCompleted' }); }
        resolve();
      });
    }),
    respondToApproval: () => {},
    onEvent: (listener) => { eventListener = listener; },
  };
}
