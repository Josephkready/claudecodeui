export type ApplyPatchOperation = 'update' | 'add' | 'delete';

export interface ApplyPatchFile {
  filePath: string;
  operation: ApplyPatchOperation;
  oldString: string;
  newString: string;
}

const FILE_HEADER = /^\*\*\* (Update|Add|Delete) File: (.+)$/;

/**
 * Parses a Codex `apply_patch` payload into one entry per touched file.
 *
 * The payload is the OpenAI apply_patch envelope:
 *   *** Begin Patch
 *   *** Update File: path/a
 *   @@ optional hunk header
 *   -removed
 *   +added
 *   *** Add File: path/b
 *   +new file line
 *   *** Delete File: path/c
 *   *** End Patch
 *
 * Each `*** {Update,Add,Delete} File:` header starts a new file section; within
 * a section `-` lines form that file's old block and `+` lines its new block.
 * Unified-diff `---`/`+++` headers and `@@` hunk headers are ignored, as is the
 * `*** Begin/End Patch` envelope. `+`/`-` content that appears before any file
 * header is bucketed under an `unknown` file, preserving the pre-split behavior
 * for a malformed payload rather than dropping it.
 *
 * Previously the caller took only the first `*** Update File:` match and merged
 * every file's `+`/`-` lines into a single blob, so a multi-file patch rendered
 * as one incorrect Edit against the first file (#99).
 */
export function parseApplyPatch(input: string): ApplyPatchFile[] {
  const files: ApplyPatchFile[] = [];

  let filePath: string | null = null;
  let operation: ApplyPatchOperation = 'update';
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let started = false;

  const flush = (): void => {
    if (!started) {
      return;
    }
    files.push({
      filePath: filePath ?? 'unknown',
      operation,
      oldString: oldLines.join('\n'),
      newString: newLines.join('\n'),
    });
    filePath = null;
    operation = 'update';
    oldLines = [];
    newLines = [];
    started = false;
  };

  for (const line of input.split('\n')) {
    const header = FILE_HEADER.exec(line);
    if (header) {
      flush();
      const word = header[1];
      operation = word === 'Add' ? 'add' : word === 'Delete' ? 'delete' : 'update';
      filePath = header[2].trim();
      started = true;
      continue;
    }

    const isOld = line.startsWith('-') && !line.startsWith('---');
    const isNew = line.startsWith('+') && !line.startsWith('+++');
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
