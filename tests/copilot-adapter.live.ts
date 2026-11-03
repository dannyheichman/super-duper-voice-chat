// copilot-adapter.live.ts
// Purpose : Manual live check (costs a few AI credits): one tiny prompt, prints event types, auto-denies approvals.
// Inputs  : none. Outputs: event log; exits non-zero if no answer or no turnCompleted arrives.
// Depends : source/target-adapters/copilot-cli-sdk-adapter.ts, signed-in Copilot CLI.
import { createCopilotCliSdkAdapter } from '../source/target-adapters/copilot-cli-sdk-adapter.ts';

const adapter = createCopilotCliSdkAdapter('claude-haiku-5.5');
let answerText = '';
const turnCompleted = new Promise<void>((resolve) => {
  adapter.onEvent((event) => {
    if (event.type === 'answerDelta') answerText += event.text;
    else if (event.type === 'approvalRequested') { console.log('APPROVAL', event.summary); adapter.respondToApproval(false); }
    else console.log(event.type, 'text' in event ? event.text.slice(0, 60) : '');
    if (event.type === 'turnCompleted' || event.type === 'turnFailed') resolve();
  });
});
await adapter.startAdapter();
await adapter.sendPrompt('Reply with exactly: pong');
await Promise.race([turnCompleted, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 90s')), 90000))]);
console.log('ANSWER:', answerText);
await adapter.stopAdapter();
process.exit(answerText.length > 0 ? 0 : 1);
