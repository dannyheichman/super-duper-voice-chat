// cli-spacebar-reader.ts
// Purpose : Overlay adapter using CLI built-in voice (spacebar) for input, session-file reader for output, TTS for read-aloud.
// Inputs  : sessionId; speech-worker-client for TTS; recognize-speech function for voice fallback.
// Outputs : TTS of reasoning + answer; loop ready for next prompt.
// Depends : session-file-reader.ts, speech-worker-client.ts.
import { watchSessionForAnswer } from './session-file-reader.ts';

export async function runCliSpacebarReader(sessionId: string, speakCommand: (text: string) => Promise<void>): Promise<void> {
  console.log('[cli-spacebar-reader] Monitoring session', sessionId);
  console.log('[cli-spacebar-reader] Hold spacebar in Copilot CLI to speak. I will read back the answer.');

  while (true) {
    try {
      console.log('[cli-spacebar-reader] Waiting for your prompt (spacebar in CLI)...');
      const { reasoning, answer } = await watchSessionForAnswer(sessionId);

      if (reasoning) {
        console.log('[cli-spacebar-reader] Reasoning: ', reasoning.slice(0, 100));
        await speakCommand(reasoning);
      }

      if (answer) {
        console.log('[cli-spacebar-reader] Answer: ', answer.slice(0, 100));
        await speakCommand(answer);
      }

      console.log('[cli-spacebar-reader] Done. Ready for next prompt.');
    } catch (err) {
      console.error('[cli-spacebar-reader] Error:', (err as any).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
