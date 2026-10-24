// Пометки для тулов, которые только читают. Это заявление сервера:
// клиент сам решает, верить ли ему.
// openWorldHint: false — тулы не ходят во внешний мир: вся база лежит рядом с сервером.
// Без этой пометки клиент по спецификации должен считать, что ходят.

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
