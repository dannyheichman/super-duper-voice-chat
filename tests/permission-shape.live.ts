// permission-shape.live.ts
// Purpose : Manual live check: prints the raw permission request objects the Copilot SDK emits (spends a few credits).
// Inputs  : none. Outputs : JSON of each permission request, then rejects it.
// Depends : @github/copilot-sdk, Copilot login.
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient();
await client.start();
const session = await client.createSession({
  model: 'claude-haiku-4.5', streaming: false,
  onPermissionRequest: async (request) => { console.log('REQUEST', JSON.stringify(request)); return { kind: 'reject' }; },
});
session.on((event: { type: string }) => { if (event.type.includes('reasoning')) console.log('EVENT', event.type); });
await session.sendAndWait?.({ prompt: 'Run the shell command: echo hello' }, 90000).catch(async () => { await session.send({ prompt: 'Run the shell command: echo hello' }); await new Promise((r) => setTimeout(r, 40000)); });
await client.stop();
process.exit(0);
