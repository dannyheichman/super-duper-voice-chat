// session-file-reader.ts
// Purpose : Watch CLI session-state/*/events.jsonl for assistant.message events and extract answer + reasoning.
// Inputs  : sessionId (UUID folder name under ~/.copilot/session-state/).
// Outputs : { reasoning: string; answer: string } when a new assistant.message event arrives.
// Depends : node:fs, node:path.
import { watchFile, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function watchSessionForAnswer(sessionId: string): Promise<{ reasoning: string; answer: string }> {
  return new Promise((resolve, reject) => {
    const eventsFile = join(homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
    let lastLineCount = 0;
    const timeout = setTimeout(() => { reject(new Error('Answer timeout')); }, 60000);

    watchFile(eventsFile, () => {
      try {
        const content = readFileSync(eventsFile, 'utf8');
        const lines = content.split('\n').filter((line) => line.trim());

        for (let i = lastLineCount; i < lines.length; i++) {
          const event = JSON.parse(lines[i]);
          if (event.type === 'assistant.message') {
            clearTimeout(timeout);
            const reasoning = event.data.reasoningText || '';
            const answer = event.data.content || '';
            watchFile(eventsFile, () => {}); // Stop watching
            resolve({ reasoning, answer });
            return;
          }
        }
        lastLineCount = lines.length;
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}
