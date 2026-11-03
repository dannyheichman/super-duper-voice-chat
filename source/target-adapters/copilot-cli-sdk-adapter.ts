// copilot-cli-sdk-adapter.ts
// Purpose : Drives a Copilot session through @github/copilot-sdk and maps its events to TargetAdapterEvent.
// Inputs  : modelName, destructive patterns; prompts via sendPrompt(); decisions via respondToApproval().
// Outputs : reasoningDelta / answerDelta / approvalRequested / turnCompleted / turnFailed events.
// Depends : @github/copilot-sdk, target-adapter.interface.ts.
import { CopilotClient, type CopilotSession } from '@github/copilot-sdk';
import type { TargetAdapter, TargetAdapterEvent } from './target-adapter.interface.ts';

const destructivePattern = /\b(rm|rmdir|del|Remove-Item|kill|chmod|chown|curl|wget|eval|format)\b|push\s+--force|DROP\s+TABLE/i;

export function createCopilotCliSdkAdapter(modelName: string): TargetAdapter {
  const client = new CopilotClient();
  let session: CopilotSession | undefined;
  let emit: (event: TargetAdapterEvent) => void = () => {};
  let pendingDecision: ((shouldApprove: boolean) => void) | undefined;

  function summarizeRequest(request: Record<string, unknown>): string {
    const detail = request.fullCommandText ?? request.commands ?? request.fileName ?? request.toolName ?? request.url;
    return `${String(request.kind)}: ${typeof detail === 'string' ? detail : JSON.stringify(detail ?? '')}`;
  }

  return {
    onEvent(listener) { emit = listener; },
    async startAdapter() {
      await client.start();
      session = await client.createSession({
        model: modelName,
        streaming: true,
        onPermissionRequest: async (request) => {
          const summary = summarizeRequest(request as unknown as Record<string, unknown>);
          emit({ type: 'approvalRequested', summary, isDestructive: destructivePattern.test(summary) });
          const shouldApprove = await new Promise<boolean>((resolve) => { pendingDecision = resolve; });
          return shouldApprove ? { kind: 'approve-once' } : { kind: 'reject' };
        },
      });
      session.on((event) => {
        const data = event.data as Record<string, unknown>;
        if (event.type === 'assistant.reasoning_delta') emit({ type: 'reasoningDelta', text: String(data.deltaContent) });
        else if (event.type === 'assistant.message_delta') emit({ type: 'answerDelta', text: String(data.deltaContent) });
        else if (event.type === 'session.idle') emit({ type: 'turnCompleted' });
        else if (event.type === 'session.error') emit({ type: 'turnFailed', message: String(data.message) });
      });
    },
    async sendPrompt(promptText) { await session!.send(promptText); },
    respondToApproval(shouldApprove) { pendingDecision?.(shouldApprove); pendingDecision = undefined; },
    async abortTurn() { await session?.abort(); },
    async stopAdapter() { await session?.disconnect(); await client.stop(); },
  };
}
