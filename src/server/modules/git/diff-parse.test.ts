import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './diff-parse';

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ export function a() {
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
\\ No newline at end of file
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/logo.png b/logo.png
new file mode 100644
Binary files /dev/null and b/logo.png differ
diff --git a/before.md b/after.md
similarity index 90%
rename from before.md
rename to after.md
`;

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(PATCH);

  it('finds every file with its status', () => {
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['src/a.ts', 'modified'],
      ['new.txt', 'added'],
      ['old.txt', 'deleted'],
      ['logo.png', 'added'],
      ['after.md', 'renamed'],
    ]);
    expect(files[4]!.oldPath).toBe('before.md');
    expect(files[3]!.binary).toBe(true);
  });

  it('counts additions and deletions', () => {
    expect(files.map((f) => [f.additions, f.deletions])).toEqual([
      [1, 1],
      [2, 0],
      [0, 1],
      [0, 0],
      [0, 0],
    ]);
  });

  it('numbers old and new lines', () => {
    const lines = files[0]!.hunks[0]!.lines;
    expect(lines).toEqual([
      { type: 'ctx', text: 'const x = 1;', oldLine: 1, newLine: 1 },
      { type: 'del', text: 'const y = 2;', oldLine: 2, newLine: null },
      { type: 'add', text: 'const y = 3;', oldLine: null, newLine: 2 },
      { type: 'ctx', text: 'const z = 4;', oldLine: 3, newLine: 3 },
    ]);
    expect(files[1]!.hunks[0]!.lines.at(-1)).toMatchObject({ type: 'note', text: 'No newline at end of file' });
  });
});
