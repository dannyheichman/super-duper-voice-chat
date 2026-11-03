import { createAcpAgentAdapter } from '../source/target-adapters/acp-agent-adapter.ts';
const adapter = createAcpAgentAdapter('copilot', ['--acp', '--stdio', '--model', 'claude-haiku-4.5']);
let answer = ''; let kinds = new Set();
adapter.onEvent((e) => { kinds.add(e.type); if (e.type === 'answerDelta') answer += e.text; if (e.type === 'turnCompleted' || e.type === 'turnFailed') { console.log(e.type, '|', answer.slice(0, 80), '|', [...kinds].join(',')); adapter.stopAdapter().then(() => process.exit(0)); } });
setTimeout(() => { console.log('TIMEOUT', [...kinds]); process.exit(1); }, 90000);
await adapter.startAdapter();
await adapter.sendPrompt('Reply with exactly: pong');
