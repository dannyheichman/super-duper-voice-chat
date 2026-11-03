// split-stream-into-sentences.ts
// Purpose : Turns streamed text deltas into complete sentences so speech can start before the response ends.
// Inputs  : text deltas via pushDelta(); flush() at end of stream.
// Outputs : arrays of complete sentences (trimmed, non-empty).
// Depends : none.

const abbreviations = ['e.g.', 'i.e.', 'etc.', 'vs.', 'Mr.', 'Mrs.', 'Dr.', 'No.'];

export interface SentenceSplitter {
  pushDelta(deltaText: string): string[];
  flush(): string[];
}

export function createSentenceSplitter(): SentenceSplitter {
  let pendingText = '';

  return {
    pushDelta(deltaText: string): string[] {
      pendingText += deltaText;
      const hasOpenCodeFence = (pendingText.match(/```/g) ?? []).length % 2 === 1;
      if (hasOpenCodeFence) return []; // hold everything until the fence closes so code is never split
      const sentences: string[] = [];
      for (let boundaryIndex = findSentenceBoundary(pendingText); boundaryIndex !== -1;
        boundaryIndex = findSentenceBoundary(pendingText)) {
        const sentence = pendingText.slice(0, boundaryIndex).trim();
        pendingText = pendingText.slice(boundaryIndex);
        if (sentence.length > 0) sentences.push(sentence);
      }
      return sentences;
    },
    flush(): string[] {
      const remainder = pendingText.trim();
      pendingText = '';
      return remainder.length > 0 ? [remainder] : [];
    },
  };
}

function findSentenceBoundary(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n' && text[index + 1] === '\n') return index + 2;
    if (!'.!?'.includes(text[index])) continue;
    const nextCharacter = text[index + 1];
    if (nextCharacter === undefined) return -1; // more text may follow (e.g. "3.14")
    if (!/\s/.test(nextCharacter)) continue;
    const textBeforeTerminator = text.slice(Math.max(0, index - 5), index + 1);
    if (abbreviations.some((abbreviation) => textBeforeTerminator.endsWith(abbreviation))) continue;
    return index + 1;
  }
  return -1;
}
