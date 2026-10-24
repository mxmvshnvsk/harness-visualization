// Все файловые тулы этапа 2. Удаление с подтверждением появится на этапе 3.

import type { Tool } from '../toolTypes.js';
import { listFilesTool } from './listFilesTool.js';
import { readFileTool } from './readFileTool.js';
import { searchFilesTool } from './searchFilesTool.js';
import { writeFileTool } from './writeFileTool.js';

export function createFileTools(): Tool[] {
  return [listFilesTool, readFileTool, searchFilesTool, writeFileTool];
}
