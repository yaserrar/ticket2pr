import type { DiffFile, DiffHunk, DiffLine } from '~/types/git';

/**
 * Parses `git diff` output into files → hunks → lines with line numbers.
 * Rendered by our own diff viewer (dark theme tokens) instead of diff2html,
 * whose stylesheet assumes a light page.
 */
const MAX_LINES_PER_FILE = 2000;

function unquote(path: string) {
  return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1).replace(/\\"/g, '"') : path;
}

function stripPrefix(path: string) {
  const p = unquote(path.trim());
  return p.replace(/^[ab]\//, '');
}

export function parseUnifiedDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let lineCount = 0;

  const push = (line: DiffLine) => {
    if (!file || !hunk) return;
    lineCount++;
    if (lineCount > MAX_LINES_PER_FILE) {
      file.truncated = true;
      return;
    }
    hunk.lines.push(line);
  };

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const rest = raw.slice('diff --git '.length);
      const split = rest.lastIndexOf(' b/');
      const path = split >= 0 ? stripPrefix(rest.slice(split + 1)) : stripPrefix(rest);
      file = { path, oldPath: null, status: 'modified', additions: 0, deletions: 0, binary: false, truncated: false, hunks: [] };
      files.push(file);
      hunk = null;
      lineCount = 0;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (raw.startsWith('new file mode')) file.status = 'added';
      else if (raw.startsWith('deleted file mode')) file.status = 'deleted';
      else if (raw.startsWith('rename from ')) {
        file.status = 'renamed';
        file.oldPath = unquote(raw.slice('rename from '.length));
      } else if (raw.startsWith('rename to ')) file.path = unquote(raw.slice('rename to '.length));
      else if (raw.startsWith('Binary files ')) file.binary = true;
      else if (raw.startsWith('+++ ') && !raw.startsWith('+++ /dev/null')) file.path = stripPrefix(raw.slice(4));
    }

    const header = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (header) {
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (raw.startsWith('+')) {
      file.additions++;
      push({ type: 'add', text: raw.slice(1), oldLine: null, newLine: newNo++ });
    } else if (raw.startsWith('-')) {
      file.deletions++;
      push({ type: 'del', text: raw.slice(1), oldLine: oldNo++, newLine: null });
    } else if (raw.startsWith(' ')) {
      push({ type: 'ctx', text: raw.slice(1), oldLine: oldNo++, newLine: newNo++ });
    } else if (raw.startsWith('\\')) {
      push({ type: 'note', text: raw.slice(2), oldLine: null, newLine: null });
    }
  }
  return files;
}
