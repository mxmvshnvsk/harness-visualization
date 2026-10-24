// Коротко описывает сообщение JSON-RPC для консоли:
// запрос — метод и номер, уведомление — метод, ответ — номер запроса и итог.

export function describeJsonRpcMessage(message: unknown): string {
  if (typeof message !== 'object' || message === null) {
    return 'непонятное сообщение';
  }
  const idText = 'id' in message ? ` #${String(message.id)}` : '';
  if ('method' in message && typeof message.method === 'string') {
    return 'id' in message ? `запрос ${message.method}${idText}` : `уведомление ${message.method}`;
  }
  if ('error' in message) {
    return `ответ с ошибкой на${idText}`;
  }
  return `ответ на${idText}`;
}
