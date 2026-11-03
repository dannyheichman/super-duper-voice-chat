// load-configuration.ts
// Purpose : Reads config/voice-chat.config.json and returns a validated, read-only configuration object.
// Inputs  : optional file path (defaults to config/voice-chat.config.json).
// Outputs : VoiceChatConfiguration; throws a descriptive Error when a field is missing or has the wrong type.
// Depends : node:fs, node:url.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface VoiceChatConfiguration {
  readonly hotkey: string;
  readonly targetAdapterName: string;
  readonly speechTier: string;
  readonly voiceName: string;
  readonly speakingRateWordsPerMinute: number;
  readonly silenceTimeoutSeconds: number;
  readonly trailingWordGraceSeconds: number;
  readonly noSpeechTimeoutSeconds: number;
  readonly turnIdleTimeoutSeconds: number;
  readonly approvalRepromptSeconds: number;
  readonly minimumCommandConfidence: number;
  readonly maximumSpokenCharactersPerTurn: number;
  readonly shouldReadReasoningAloud: boolean;
  readonly shouldListenWhileSpeaking: boolean;
  readonly destructiveConfirmationPhrase: string;
}

const expectedFieldTypes: Record<keyof VoiceChatConfiguration, 'string' | 'number' | 'boolean'> = {
  hotkey: 'string', targetAdapterName: 'string', speechTier: 'string', voiceName: 'string',
  speakingRateWordsPerMinute: 'number', silenceTimeoutSeconds: 'number',
  trailingWordGraceSeconds: 'number', noSpeechTimeoutSeconds: 'number',
  turnIdleTimeoutSeconds: 'number', approvalRepromptSeconds: 'number',
  minimumCommandConfidence: 'number', maximumSpokenCharactersPerTurn: 'number',
  shouldReadReasoningAloud: 'boolean', shouldListenWhileSpeaking: 'boolean',
  destructiveConfirmationPhrase: 'string',
};

const defaultConfigurationPath = fileURLToPath(
  new URL('../../config/voice-chat.config.json', import.meta.url),
);

export function loadConfiguration(
  configurationPath: string = defaultConfigurationPath,
): VoiceChatConfiguration {
  const parsed = JSON.parse(readFileSync(configurationPath, 'utf8')) as Record<string, unknown>;
  for (const [fieldName, expectedType] of Object.entries(expectedFieldTypes)) {
    if (typeof parsed[fieldName] !== expectedType) {
      throw new Error(`Configuration field "${fieldName}" must be a ${expectedType} (${configurationPath})`);
    }
  }
  return Object.freeze(parsed) as unknown as VoiceChatConfiguration;
}
