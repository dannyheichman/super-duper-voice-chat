// recognize-speech-locally.ts
// Purpose : Offline streaming speech recognition: microphone (MicCapture.ps1) -> sherpa-onnx zipformer -> finished utterances.
// Inputs  : modelDirectoryPath; MicCapture.ps1 path; callback per finished utterance.
// Outputs : startMicrophoneRecognition returns {setIsListening, stop}; utterances are only reported while listening.
// Depends : sherpa-onnx-node, node:child_process, PowerShell 5.1.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const sherpa = createRequire(import.meta.url)('sherpa-onnx-node');

export function startMicrophoneRecognition(modelDirectoryPath: string, micCaptureScriptPath: string, onUtterance: (text: string) => void) {
  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(modelDirectoryPath, 'encoder-epoch-99-avg-1.int8.onnx'),
        decoder: join(modelDirectoryPath, 'decoder-epoch-99-avg-1.onnx'),
        joiner: join(modelDirectoryPath, 'joiner-epoch-99-avg-1.int8.onnx'),
      },
      tokens: join(modelDirectoryPath, 'tokens.txt'), numThreads: 2, provider: 'cpu',
    },
    decodingMethod: 'greedy_search', enableEndpoint: true,
    rule1MinTrailingSilence: 1.2, rule2MinTrailingSilence: 0.8, rule3MinUtteranceLength: 20,
  });
  const stream = recognizer.createStream();
  let isListening = false;
  const micProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', micCaptureScriptPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  let leftoverByte: Buffer = Buffer.alloc(0);
  micProcess.stdout.on('data', (chunk: Buffer) => {
    const bytes = Buffer.concat([leftoverByte, chunk]);
    const usableLength = bytes.length - (bytes.length % 2);
    leftoverByte = bytes.subarray(usableLength);
    const samples = new Float32Array(usableLength / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
    stream.acceptWaveform({ sampleRate: 16000, samples });
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    if (recognizer.isEndpoint(stream)) {
      const text = String(recognizer.getResult(stream).text).trim();
      recognizer.reset(stream);
      if (isListening && text) onUtterance(text);
    }
  });
  return {
    setIsListening: (shouldListen: boolean) => { isListening = shouldListen; if (shouldListen) recognizer.reset(stream); },
    stop: () => micProcess.kill(),
  };
}
