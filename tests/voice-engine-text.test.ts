// voice-engine-text.test.ts
// Purpose : Verifies the sentence splitter, read-aloud filter and config loader (plan §9 S1, R1, R2).
// Inputs  : none. Outputs: node:test results.
// Depends : source/voice-engine/*, source/shared/load-configuration.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSentenceSplitter } from '../source/voice-engine/split-stream-into-sentences.ts';
import { filterTextForReadAloud } from '../source/voice-engine/filter-text-for-read-aloud.ts';
import { loadConfiguration } from '../source/shared/load-configuration.ts';

test('splitter speaks first sentence before stream ends', () => {
  const splitter = createSentenceSplitter();
  assert.deepEqual(splitter.pushDelta('Hello the'), []);
  assert.deepEqual(splitter.pushDelta('re. Second one'), ['Hello there.']);
  assert.deepEqual(splitter.flush(), ['Second one']);
});

test('splitter keeps decimals and abbreviations intact', () => {
  const splitter = createSentenceSplitter();
  assert.deepEqual(splitter.pushDelta('Use v3.14 e.g. now. Done. '), ['Use v3.14 e.g. now.', 'Done.']);
});

test('splitter holds an open code fence', () => {
  const splitter = createSentenceSplitter();
  assert.deepEqual(splitter.pushDelta('Try:\n```js\nconsole.log(1). x'), []);
  assert.equal(splitter.pushDelta('\n```\nDone. ').length > 0, true);
});

test('filter omits code and tables, shortens paths and links', () => {
  const result = filterTextForReadAloud(
    'See C:\\Users\\danny\\projects\\app\\main.ts and https://example.com/a/b.\n```ts\nx=1\n```\n| a | b |\n| 1 | 2 |\n',
  );
  assert.match(result.spokenText, /Code block omitted/);
  assert.match(result.spokenText, /Table omitted/);
  assert.match(result.spokenText, /app slash main\.ts/);
  assert.match(result.spokenText, /example\.com link/);
  assert.equal(result.omittedBlocks.length, 2);
});

test('filter truncates long output', () => {
  assert.match(filterTextForReadAloud('word '.repeat(1000), 100).spokenText, /Output truncated/);
});

test('default configuration loads and validates', () => {
  assert.equal(loadConfiguration().silenceTimeoutSeconds, 2);
});
