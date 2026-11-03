// acp-agent-adapter.ts
// Purpose : Generic adapter for any Agent Client Protocol (ACP) agent over stdio, e.g. `copilot --acp --stdio`.
// Inputs  : agentCommand + agentArguments to spawn; prompts via sendPrompt(); decisions via respondToApproval().
// Outputs : reasoningDelta / answerDelta / approvalRequested / turnCompleted / turnFailed events.
// Depends : node:child_process, node:readline, target-adapter.interface.ts. Untested against a live agent.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { TargetAdapter, TargetAdapterEvent } from './target-adapter.interface.ts';

type JsonRpcMessage = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };

export function createAcpAgentAdapter(agentCommand: string, agentArguments: string[]): TargetAdapter {
  let agentProcess: ChildProcess | undefined;
  let emit: (event: TargetAdapterEvent) => void = () => {};
  let sessionId = '';
  let nextRequestId = 1;
  let pendingPermission: { requestId: number; options: Array<{ optionId: string; kind: string }> } | undefined;
  const pendingResponses = new Map<number, (message: JsonRpcMessage) => void>();

  const write = (message: object) => agentProcess!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const callAgent = (method: string, params: object) => new Promise<JsonRpcMessage>((resolve) => {
    const id = nextRequestId++;
    pendingResponses.set(id, resolve);
    write({ id, method, params });
  });

  function handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) { pendingResponses.get(message.id)?.(message); pendingResponses.delete(message.id); return; }
    if (message.method === 'session/update') {
      const update = message.params.update;
      if (update.sessionUpdate === 'agent_message_chunk') emit({ type: 'answerDelta', text: String(update.content?.text ?? '') });
      else if (update.sessionUpdate === 'agent_thought_chunk') emit({ type: 'reasoningDelta', text: String(update.content?.text ?? '') });
    } else if (message.method === 'session/request_permission' && message.id !== undefined) {
      pendingPermission = { requestId: message.id, options: message.params.options };
      const summary = String(message.params.toolCall?.title ?? 'a tool action');
      emit({ type: 'approvalRequested', summary, isDestructive: /\b(rm|del|Remove-Item|kill|format)\b|push\s+--force|DROP\s+TABLE/i.test(summary) });
    }
  }

  return {
    onEvent(listener) { emit = listener; },
    async startAdapter() {
      agentProcess = spawn(agentCommand, agentArguments, { stdio: ['pipe', 'pipe', 'inherit'], shell: true });
      createInterface({ input: agentProcess.stdout! }).on('line', (line) => { try { handleMessage(JSON.parse(line)); } catch { /* ignore non-JSON output */ } });
      await callAgent('initialize', { protocolVersion: 1, clientCapabilities: {} });
      sessionId = (await callAgent('session/new', { cwd: process.cwd(), mcpServers: [] })).result.sessionId;
    },
    async sendPrompt(promptText) {
      callAgent('session/prompt', { sessionId, prompt: [{ type: 'text', text: promptText }] })
        .then((response) => emit(response.error ? { type: 'turnFailed', message: response.error.message } : { type: 'turnCompleted' }));
    },
    respondToApproval(shouldApprove) {
      if (!pendingPermission) return;
      const wantedKind = shouldApprove ? 'allow_once' : 'reject_once';
      const option = pendingPermission.options.find((candidate) => candidate.kind === wantedKind);
      write({ id: pendingPermission.requestId, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
      pendingPermission = undefined;
    },
    async abortTurn() { write({ method: 'session/cancel', params: { sessionId } }); },
    async stopAdapter() { agentProcess?.kill(); },
  };
}
