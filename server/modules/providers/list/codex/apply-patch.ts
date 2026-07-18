export type ApplyPatchOperation = 'update' | 'add' | 'delete';

export interface ApplyPatchFile {
  filePath: string;
  operation: ApplyPatchOperation;
  oldString: string;
  newString: string;
  /** Destination path when the section carried a `*** Move to:` rename directive. */
  movedTo?: string;
}

const FILE_HEADER = /^\*\*\* (Update|Add|Delete) File: (.+)$/;
const MOVE_HEADER = /^\*\*\* Move to: (.+)$/;

/**
 * Parses a Codex `apply_patch` payload into one entry per touched file.
 *
 * The payload is the OpenAI apply_patch envelope:
 *   *** Begin Patch
 *   *** Update File: path/a
 *   *** Move to: path/a-renamed        (optional rename directive)
 *   @@ optional hunk header
 *   -removed
 *   +added
 *   *** Add File: path/b
 *   +new file line
 *   *** Delete File: path/c
 *   *** End Patch
 *
 * Each `*** {Update,Add,Delete} File:` header starts a new file section; within
 * a section `-` lines form that file's old block and `+` lines its new block
 * (exactly one leading marker char is stripped). `@@` hunk headers, context
 * lines, and the `*** Begin/End Patch` envelope don't start with `+`/`-` and are
 * skipped. A `*** Move to:` line records the rename destination. `+`/`-` content
 * appearing before any file header is bucketed under an `unknown` file, so a
 * malformed payload still renders instead of dropping.
 *
 * apply_patch does not use unified-diff `---`/`+++` file headers, so a content
 * line that merely starts with extra dashes/pluses (e.g. `--count`, a `-----`
 * separator) is kept, not mistaken for a header.
 *
 * Previously the caller took only the first `*** Update File:` match and merged
 * every file's `+`/`-` lines into a single blob, so a multi-file patch rendered
 * as one incorrect Edit against the first file (#99).
 */
export function parseApplyPatch(input: string): ApplyPatchFile[] {
  const files: ApplyPatchFile[] = [];

  let filePath: string | null = null;
  let movedTo: string | null = null;
  let operation: ApplyPatchOperation = 'update';
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let started = false;

  const flush = (): void => {
    if (!started) {
      return;
    }
    const file: ApplyPatchFile = {
      filePath: filePath ?? 'unknown',
      operation,
      oldString: oldLines.join('\n'),
      newString: newLines.join('\n'),
    };
    if (movedTo) {
      file.movedTo = movedTo;
    }
    files.push(file);
    filePath = null;
    movedTo = null;
    operation = 'update';
    oldLines = [];
    newLines = [];
    started = false;
  };

  for (const line of input.split(/\r\n|\r|\n/)) {
    const header = FILE_HEADER.exec(line);
    if (header) {
      flush();
      const word = header[1];
      operation = word === 'Add' ? 'add' : word === 'Delete' ? 'delete' : 'update';
      filePath = header[2].trim();
      started = true;
      continue;
    }

    const move = MOVE_HEADER.exec(line);
    if (move && started) {
      movedTo = move[1].trim();
      continue;
    }

    const isOld = line.startsWith('-');
    const isNew = line.startsWith('+');
    if (!isOld && !isNew) {
      continue;
    }

    if (!started) {
      // `+`/`-` content before any file header — keep a legacy `unknown` bucket
      // so a malformed patch still renders instead of vanishing.
      filePath = 'unknown';
      operation = 'update';
      started = true;
    }

    if (isOld) {
      oldLines.push(line.slice(1));
    } else {
      newLines.push(line.slice(1));
    }
  }

  flush();
  return files;
}
