// Ошибка, понятная модели: её текст вернётся модели как результат тула,
// чтобы она могла исправиться — например, взять другой путь.

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
