/**
 * Claude ends every run with a summary for the reviewer, then optional
 * sections the prompt asks for:
 *
 *   ## Client update                → a plain-language note for the client
 *   ## Questions for the client     → the request is unclear: what to ask
 *
 * `splitSummary` separates them so the reviewer summary (commit message, PR
 * body) stays technical and the client texts can be edited and posted.
 */
export const CLIENT_UPDATE_HEADING = 'Client update';
export const QUESTIONS_HEADING = 'Questions for the client';

const SECTION = /^#{1,4}\s*(client update|questions for the client)\s*:?\s*$/i;

export type SplitSummary = { summary: string; clientUpdate: string | null; questions: string | null };

export function splitSummary(text: string | null | undefined): SplitSummary {
  const out: SplitSummary = { summary: '', clientUpdate: null, questions: null };
  if (!text) return out;
  const lines = text.split('\n');
  const parts: { key: 'summary' | 'clientUpdate' | 'questions'; lines: string[] }[] = [{ key: 'summary', lines: [] }];
  for (const line of lines) {
    const match = line.trim().match(SECTION);
    if (match) {
      parts.push({ key: match[1].toLowerCase() === 'client update' ? 'clientUpdate' : 'questions', lines: [] });
      continue;
    }
    parts[parts.length - 1].lines.push(line);
  }
  for (const part of parts) {
    const body = part.lines.join('\n').trim();
    if (part.key === 'summary') out.summary = out.summary ? `${out.summary}\n\n${body}` : body;
    else if (body) out[part.key] = out[part.key] ? `${out[part.key]}\n\n${body}` : body;
  }
  out.summary = out.summary.trim();
  return out;
}
