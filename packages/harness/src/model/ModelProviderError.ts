// Ошибка обращения к модели: сеть, таймаут, ответ с кодом не 2xx или непонятный ответ.

export class ModelProviderError extends Error {
  readonly status: number | null;
  readonly responseBody: unknown;

  constructor(message: string, status: number | null, responseBody: unknown) {
    super(message);
    this.name = 'ModelProviderError';
    this.status = status;
    this.responseBody = responseBody;
  }
}
