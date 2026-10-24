# Формат событий трейса

Харнесс на каждом шаге отправляет событие в поток событий. Подписчики получают его одновременно: консоль, файл трейса, токеномика, а позже — браузер. Файл трейса — это JSONL: одно событие на строку, файлы лежат в `traces/` (в git не попадают).

Типы событий описаны в коде: `packages/harness/src/events/harnessEvents.ts`.

## Общие поля

| Поле        | Что это                                |
| ----------- | -------------------------------------- |
| `type`      | тип события, см. ниже                  |
| `sequence`  | порядковый номер в сессии, начиная с 1 |
| `sessionId` | короткий идентификатор сессии          |
| `timestamp` | время в ISO 8601, UTC                  |

## События

| Тип                    | Когда                                                              | Главные поля                                                                                        |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `session_started`      | сессия началась                                                    | `providerName`, `baseUrl`, `model`, `reasoningEffort`, `networkProxy`, `searchProvider`             |
| `workspace_prepared`   | песочница готова к сессии                                          | `directory`, `createdFromSeed`, `wasReset`                                                          |
| `mcp_server_starting`  | харнесс запускает MCP-сервер                                       | `serverName`, `command`, `args`, `trustAnnotations`                                                 |
| `mcp_server_ready`     | рукопожатие прошло, список тулов получен                           | `serverName`, `serverInfo`, `protocolVersion`, `instructions`, `tools`, `durationMs`                |
| `mcp_server_failed`    | сервер не запустился, сессия идёт без его тулов                    | `serverName`, `message`                                                                             |
| `mcp_message`          | сообщение JSON-RPC между харнессом и MCP-сервером                  | `serverName`, `direction` (`to_server`, `from_server`), `message`                                   |
| `mcp_server_log`       | строка из stderr сервера                                           | `serverName`, `text`                                                                                |
| `mcp_server_stopped`   | харнесс остановил сервер в конце сессии                            | `serverName`                                                                                        |
| `network_request`      | харнесс отправляет HTTP-запрос: к модели, поисковику или странице  | `host`, `route` (`proxy`, `direct`), `viaProxy`, `rule`, `proxyUrl` (секреты скрыты)                |
| `user_message`         | пришёл запрос пользователя                                         | `text`                                                                                              |
| `prompt_assembled`     | харнесс собрал контекст для модели                                 | `messages`, `toolNames`                                                                             |
| `model_request`        | HTTP-запрос к модели собран и отправляется                         | `requestId`, `iteration`, `reasoningEffort`, `method`, `url`, `headers` (секреты скрыты), `body`    |
| `model_response`       | модель ответила                                                    | `requestId`, `status`, `durationMs`, `body`, `reply`, `cost`                                        |
| `model_error`          | запрос к модели не удался                                          | `requestId`, `status`, `durationMs`, `body`, `message`                                              |
| `tool_call`            | модель попросила вызвать тул                                       | `toolCallId`, `toolName`, `argumentsText`, `arguments`                                              |
| `permission_evaluated` | политика разрешений приняла решение (на каждом вызове)             | `toolCallId`, `toolName`, `effects`, `targets`, `actionDescription`, `decision`, `reason`, `checks` |
| `permission_requested` | тулу нужно разрешение пользователя                                 | `toolCallId`, `toolName`, `actionDescription`                                                       |
| `permission_resolved`  | пользователь ответил                                               | `toolCallId`, `toolName`, `approved`, `waitedForUserMs`                                             |
| `tool_result`          | тул выполнен, не смог, пользователь отказал или политика запретила | `toolCallId`, `toolName`, `status`, `content`, `details`, `durationMs`                              |
| `assistant_message`    | харнесс отдал ответ пользователю                                   | `text`                                                                                              |
| `session_finished`     | сессия закончилась                                                 | `durationMs`, `modelRequests`, `usage`, `cost`                                                      |
| `error`                | ошибка, прервавшая сессию                                          | `message`                                                                                           |

`model_request` и `model_response` связаны полем `requestId`, `tool_call` и `tool_result` — полем `toolCallId`. Тот же `toolCallId` стоит в ответе модели (`reply.toolCalls`) и в сообщении с результатом тула, которое уходит модели в следующем запросе.

## Цикл агента в событиях

Один ход с тулами выглядит так:

```
user_message → prompt_assembled
model_request (шаг 1) → model_response (просит тулы)
  tool_call → tool_result
  tool_call → tool_result
model_request (шаг 2) → model_response (ответ текстом)
assistant_message
```

Каждый следующий `model_request` несёт в `body.messages` всю историю: ответы модели с `tool_calls` и результаты тулов с ролью `tool`. Модель ничего не помнит между запросами — помнит харнесс.

## Два слоя ответа модели

В `model_response` ответ лежит дважды:

- `body` — сырой JSON провайдера, как он пришёл по сети;
- `reply` — тот же ответ в нашем нейтральном формате: `finishReason`, `text`, `reasoningText`, `usage`.

Так видно, что именно прислал провайдер, а интерфейс работает с одним форматом для любого провайдера.

## Результат тула

- `status`: `success` — тул выполнен, `error` — не выполнился (модель получит текст ошибки и сможет исправиться), `denied` — пользователь не разрешил действие, `blocked` — действие запрещено политикой харнесса.
- `content` — ровно то, что увидит модель.
- `details` — подробности для трейса и токеномики, модель их не видит. У `fetch_url` это адрес после перенаправлений, вес скачанного HTML и сколько символов текста из него получилось; у `web_search` — кредиты Tavily и время ответа или, у Яндекса, размер полученного XML и стоимость поиска по дневному или ночному тарифу.

Между `tool_call` и `tool_result` всегда стоит `permission_evaluated` — «след решения» политики: все проверки по порядку (`checks`: источник, что проверялось, подошло ли, решение), итог `decision` (`allow`, `ask`, `deny`) и причина `reason`. Если итог `ask`, дальше идут `permission_requested` и `permission_resolved`. Возможность действия харнесс проверяет до вопроса: про несуществующий файл пользователя не спрашивают. Время, пока пользователь решал, записано в `waitedForUserMs` и в `durationMs` тула не входит.

## MCP

Вызов MCP-тула для цикла агента — обычный `tool_call` → `permission_evaluated` → `tool_result`, а между ними — пара `mcp_message`: запрос `tools/call` и ответ с тем же `id`. В `tools` события `mcp_server_ready` у каждого тула есть имя для модели (`kedr__search`), имя на сервере (`search`), пометки сервера (`annotations`) и классы действий, которые харнесс из них вывел (`effects`). Пустые `effects` значат, что пометкам сервера харнесс не доверяет (`trustAnnotations: false`), и решение примет `defaultDecision`. В `details` результата MCP-тула — `mcpServer` и `mcpTool`.

## Токены и стоимость

`reply.usage` — точные цифры от провайдера:

| Поле                   | Что это                                          |
| ---------------------- | ------------------------------------------------ |
| `inputTokens`          | все токены запроса                               |
| `inputCacheHitTokens`  | из них взяты из кэша промпта — они дешевле       |
| `inputCacheMissTokens` | из них не попали в кэш                           |
| `outputTokens`         | токены ответа, включая рассуждения               |
| `reasoningTokens`      | часть `outputTokens`, потраченная на рассуждения |

`cost` — стоимость по таблице цен из `harness.config.json`: тариф (`peak` или `offPeak` у DeepSeek), стоимость по частям, итог и дата проверки цен. Если цен для модели нет, `cost` равно `null`.

## Уровень рассуждений

`reasoningEffort` — наш нейтральный уровень: `off`, `low`, `high`, `max`. В `session_started` — уровень сессии, в `model_request` — уровень конкретного запроса. Как он превратился в параметры API, видно в `body` того же события (у DeepSeek — `thinking` и `reasoning_effort`).

## Секреты

Заголовки `Authorization`, `X-Api-Key` и `Api-Key` в трейс попадают уже замаскированными: `Bearer ***`.

## Пример

```json
{
  "type": "model_request",
  "requestId": "2f6c…",
  "method": "POST",
  "url": "https://api.deepseek.com/chat/completions",
  "headers": { "Content-Type": "application/json", "Authorization": "Bearer ***" },
  "body": {
    "thinking": { "type": "enabled" },
    "model": "deepseek-flash",
    "messages": [
      { "role": "system", "content": "…" },
      { "role": "user", "content": "…" }
    ],
    "max_tokens": 2048,
    "stream": false
  },
  "sequence": 4,
  "sessionId": "e4d4a8ea",
  "timestamp": "2026-10-24T12:59:05.120Z"
}
```
