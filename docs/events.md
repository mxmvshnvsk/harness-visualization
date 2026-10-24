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

## События этапа 1

| Тип                 | Когда                                      | Главные поля                                                     |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `session_started`   | сессия началась                            | `providerName`, `baseUrl`, `model`                               |
| `user_message`      | пришёл запрос пользователя                 | `text`                                                           |
| `prompt_assembled`  | харнесс собрал контекст для модели         | `messages`                                                       |
| `model_request`     | HTTP-запрос к модели собран и отправляется | `requestId`, `method`, `url`, `headers` (секреты скрыты), `body` |
| `model_response`    | модель ответила                            | `requestId`, `status`, `durationMs`, `body`, `reply`, `cost`     |
| `model_error`       | запрос к модели не удался                  | `requestId`, `status`, `durationMs`, `body`, `message`           |
| `assistant_message` | харнесс отдал ответ пользователю           | `text`                                                           |
| `session_finished`  | сессия закончилась                         | `durationMs`, `modelRequests`, `usage`, `cost`                   |
| `error`             | ошибка, прервавшая сессию                  | `message`                                                        |

`model_request` и `model_response` связаны полем `requestId`.

## Два слоя ответа модели

В `model_response` ответ лежит дважды:

- `body` — сырой JSON провайдера, как он пришёл по сети;
- `reply` — тот же ответ в нашем нейтральном формате: `finishReason`, `text`, `reasoningText`, `usage`.

Так видно, что именно прислал провайдер, а интерфейс работает с одним форматом для любого провайдера.

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
