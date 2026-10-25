# MCP

**Model Context Protocol** — открытый протокол, по которому приложение с моделью подключает внешние данные и tools. Участники:

- **MCP host** — приложение с моделью; здесь это харнесс;
- **MCP client** — соединение host с одним сервером; на каждый сервер свой client;
- **MCP server** — программа, которая даёт tools, resources и prompts; здесь — сервер базы знаний «Кедр Софт» (`kedr`).

## Как они говорят

- Сообщения — JSON-RPC 2.0. В «Сырых событиях» это `mcp_message`.
- Транспорт `kedr` — stdio: харнесс запускает сервер отдельным процессом и пишет ему в stdin, читает из stdout. Логи сервер пишет в stderr — это `mcp_server_log`.
- Харнесс спрашивает список tools (`tools/list`), показывает их модели под именами «сервер__тул» и вызывает выбранный (`tools/call`).

Часть tools сервера харнесс может скрыть от модели (`hiddenTools`) и вызывать сам — так устроен поиск харнессом в режимах retrieval `auto` и `rewrite`.

Харнесс говорит на версии протокола 2025-11-25. Последняя опубликованная версия — 2026-07-28: в ней протокол стал stateless, а возможности сервера узнают запросом `server/discover`.

Проверено: 25.10.2026

## Источники

- [MCP — Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP — The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
