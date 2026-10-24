// fetch пишет просто «fetch failed», а настоящая причина (DNS, отказ соединения,
// прокси, таймаут) лежит в error.cause — показываем её.

export function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (error.cause instanceof Error) {
    return `${error.message} (${error.cause.message})`;
  }
  return error.message;
}
