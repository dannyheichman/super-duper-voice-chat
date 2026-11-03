// interpret-voice-command.ts
// Purpose : Maps a recognized phrase to a command name for the current conversation state.
// Inputs  : recognized text, state name, destructiveConfirmationPhrase.
// Outputs : command name string or undefined when the phrase is not a command in that state.
// Depends : none.

export type VoiceCommand = 'sendNow' | 'cancelAll' | 'approve' | 'deny' | 'confirmDestructive' | 'stopTalking' | 'repeatThat' | 'scratchThat';

const phrasesByState: Record<string, ReadonlyArray<readonly [VoiceCommand, readonly string[]]>> = {
  listening: [['sendNow', ['send it', 'go ahead']], ['scratchThat', ['scratch that']], ['cancelAll', ['cancel', 'never mind']]],
  speaking: [['stopTalking', ['stop talking', 'quiet']], ['repeatThat', ['repeat that']]],
  awaitingApproval: [['approve', ['approve', 'yes', 'allow']], ['deny', ['deny', 'no', 'reject']], ['cancelAll', ['cancel']], ['repeatThat', ['repeat that']]],
  confirmingDestructive: [['confirmDestructive', []], ['deny', ['deny', 'no', 'cancel']]],
};

export function interpretVoiceCommand(recognizedText: string, stateName: string, destructiveConfirmationPhrase: string): VoiceCommand | undefined {
  const normalizedText = recognizedText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (stateName === 'confirmingDestructive' && normalizedText === destructiveConfirmationPhrase.toLowerCase()) return 'confirmDestructive';
  for (const [command, phrases] of phrasesByState[stateName] ?? []) {
    if (phrases.includes(normalizedText)) return command;
  }
  return undefined;
}
