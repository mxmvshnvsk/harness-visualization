// Адаптеры чужих записей без node:-модулей: годятся и для сервера, и для браузера.

export { convertClaudeCode, isClaudeCodeTranscript, parseClaudeCodeLines } from './claudeCode.js';
export { maskHomePaths, maskSecretText } from './maskSecretText.js';
