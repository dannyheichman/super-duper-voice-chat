// filter-text-for-read-aloud.ts
// Purpose : Makes markdown speakable: omits code/diff/table blocks, shortens paths and URLs, truncates long text.
// Inputs  : markdown text; maximumSpokenCharacters.
// Outputs : { spokenText, omittedBlocks } where omittedBlocks keeps the raw text for a later "read the code".
// Depends : none.

export interface ReadAloudResult {
  readonly spokenText: string;
  readonly omittedBlocks: readonly string[];
}

export function filterTextForReadAloud(markdown: string, maximumSpokenCharacters = 2000): ReadAloudResult {
  const omittedBlocks: string[] = [];
  const omit = (label: string) => (block: string): string => {
    omittedBlocks.push(block);
    return ` ${label} omitted. `;
  };
  let text = markdown
    .replace(/```[\s\S]*?```/g, omit('Code block'))
    .replace(/(?:^[ \t]*\|.*\|[ \t]*(?:\n|$))+/gm, omit('Table'))
    .replace(/^--- .*\n\+\+\+ .*\n(?:^[ +\-@].*(?:\n|$))+/gm, omit('Diff'));
  text = text
    .replace(/https?:\/\/([^\s/)]+)[^\s)]*/g, '$1 link')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.\-@]+){3,}/g, shortenPath)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maximumSpokenCharacters) {
    const hiddenCharacterCount = text.length - maximumSpokenCharacters;
    text = `${text.slice(0, maximumSpokenCharacters).trim()} Output truncated, ${hiddenCharacterCount} more characters.`;
  }
  return { spokenText: text, omittedBlocks };
}

function shortenPath(path: string): string {
  return path.split(/[\\/]/).filter((segment) => segment.length > 0).slice(-2).join(' slash ');
}
