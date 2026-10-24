// Все файловые тулы. Работают только внутри песочницы.

import type { Tool } from '../toolTypes.js';
import { deleteFileTool } from './deleteFileTool.js';
import { listFilesTool } from './listFilesTool.js';
import { readFileTool } from './readFileTool.js';
import { searchFilesTool } from './searchFilesTool.js';
import { writeFileTool } from './writeFileTool.js';

export function createFileTools(): Tool[] {
  return [listFilesTool, readFileTool, searchFilesTool, writeFileTool, deleteFileTool];
}
