import { describe, expect, it } from 'vitest';
import { splitSummary } from './summary';

describe('splitSummary', () => {
  it('separates the client update and the questions from the reviewer summary', () => {
    const out = splitSummary(
      [
        'Changed the footer link to /legal/privacy. `npm test` passes.',
        '',
        '## Client update',
        'The Privacy link in the footer now opens the right page.',
        '',
        '### Questions for the client:',
        '- Is there a French version of the site?',
      ].join('\n'),
    );
    expect(out.summary).toBe('Changed the footer link to /legal/privacy. `npm test` passes.');
    expect(out.clientUpdate).toBe('The Privacy link in the footer now opens the right page.');
    expect(out.questions).toBe('- Is there a French version of the site?');
  });

  it('keeps a plain summary as is', () => {
    expect(splitSummary('Done.\n\nFiles: a.ts')).toEqual({ summary: 'Done.\n\nFiles: a.ts', clientUpdate: null, questions: null, previewPages: [] });
    expect(splitSummary(null)).toEqual({ summary: '', clientUpdate: null, questions: null, previewPages: [] });
  });

  it('ignores empty sections and other headings', () => {
    const out = splitSummary('## What I changed\nThe link.\n\n## Client update\n\n');
    expect(out.summary).toBe('## What I changed\nThe link.');
    expect(out.clientUpdate).toBeNull();
  });

  it('reads the pages to preview: paths only, three at most', () => {
    const out = splitSummary(
      ['Done.', '', '## Client update', 'The footer shows the new number.', '', '## Pages to preview', '- `/`', '- /contact (footer)', '- https://evil.example/x', '- //cdn', '- /a', '- /b'].join('\n'),
    );
    expect(out.clientUpdate).toBe('The footer shows the new number.');
    expect(out.previewPages).toEqual(['/', '/contact', '/a']);
  });
});
