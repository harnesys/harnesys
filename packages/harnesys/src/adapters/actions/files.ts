import { editFileTool } from '../../packs/files/edit-file.ts';
import { extractFileTextTool } from '../../packs/files/extract-file-text.ts';
import { globTool } from '../../packs/files/glob.ts';
import { grepTool } from '../../packs/files/grep.ts';
import { listDirTool } from '../../packs/files/list-dir.ts';
import { readFileTool } from '../../packs/files/read-file.ts';
import { readImageTool } from '../../packs/files/read-image.ts';
import { writeDocxTool } from '../../packs/files/write-docx.ts';
import { writeFileTool } from '../../packs/files/write-file.ts';
import { writeXlsxTool } from '../../packs/files/write-xlsx.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import type { FilesOptions } from './files-options.ts';
export function files(options: FilesOptions = {}): ToolDefinition[] {
  return [
    readFileTool(options),
    extractFileTextTool(options),
    readImageTool(options),
    writeFileTool(options),
    writeXlsxTool(options),
    writeDocxTool(options),
    editFileTool(options),
    listDirTool(options),
    globTool(options),
    grepTool(options),
  ];
}
