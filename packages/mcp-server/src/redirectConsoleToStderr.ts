// stdout MCP-сервера занят протоколом JSON-RPC: любая посторонняя строка там сломает
// клиенту разбор сообщений. Библиотеки об этом не знают — transformers.js, например,
// пишет информационные сообщения через console.log. Поэтому console.log, info и debug
// перенаправляются в stderr, откуда харнесс читает журнал сервера.

export function redirectConsoleToStderr(): void {
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
}
