/**
 * Claude ends every run with a summary for the reviewer, then optional
 * sections the prompt asks for:
 *
 *   ## Client update                → a plain-language note for the client
 *   ## Questions for the client     → the request is unclear: what to ask
 *   ## Pages to preview             → (screenshots on) public pages showing the change
 *
 * `splitSummary` separates them so the reviewer summary (commit message, PR
 * body) stays technical and the client texts can be edited and posted.
 */
export const CLIENT_UPDATE_HEADING = 'Client update';
export const QUESTIONS_HEADING = 'Questions for the client';
export const PREVIEW_HEADING = 'Pages to preview';

const SECTION = /^#{1,4}\s*(client update|questions for the client|pages to preview)\s*:?\s*$/i;
const MAX_PREVIEW_PAGES = 3;

export type SplitSummary = { summary: string; clientUpdate: string | null; questions: string | null; previewPages: string[] };

type Key = 'summary' | 'clientUpdate' | 'questions' | 'previewPages';
const KEYS: Record<string, Key> = { 'client update': 'clientUpdate', 'questions for the client': 'questions', 'pages to preview': 'previewPages' };

/** `- /contact`, `` `/fr/menu?tab=2` ``: URL paths only (never full URLs: the app runs locally). */
export function parsePreviewPages(body: string): string[] {
  const pages = body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, '').replace(/`/g, '').trim().split(/\s/)[0] ?? '')
    .filter((p) => /^\/[^\s]*$/.test(p) && !p.startsWith('//'));
  return [...new Set(pages)].slice(0, MAX_PREVIEW_PAGES);
}

export function splitSummary(text: string | null | undefined): SplitSummary {
  const out: SplitSummary = { summary: '', clientUpdate: null, questions: null, previewPages: [] };
  if (!text) return out;
  const lines = text.split('\n');
  const parts: { key: Key; lines: string[] }[] = [{ key: 'summary', lines: [] }];
  for (const line of lines) {
    const match = line.trim().match(SECTION);
    if (match) {
      parts.push({ key: KEYS[match[1].toLowerCase()] ?? 'summary', lines: [] });
      continue;
    }
    parts[parts.length - 1].lines.push(line);
  }
  for (const part of parts) {
    const body = part.lines.join('\n').trim();
    if (part.key === 'summary') out.summary = out.summary ? `${out.summary}\n\n${body}` : body;
    else if (part.key === 'previewPages') out.previewPages = [...new Set([...out.previewPages, ...parsePreviewPages(body)])].slice(0, MAX_PREVIEW_PAGES);
    else if (body) out[part.key] = out[part.key] ? `${out[part.key]}\n\n${body}` : body;
  }
  out.summary = out.summary.trim();
  return out;
}
