// Уверенность по токенам у ответа обычной сессии (этап 11.4): если сессия шла с logprobs
// (model.topLogprobs > 0 в harness.config.json), ответ модели раскрашен так же, как в лаборатории
// «Выбор токена», и у каждого токена видны альтернативы. Нет logprobs — обычный текст.

import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { ModelReply } from '@harness-visualization/harness';
import { toTokenView } from '../../projections/projectTokenLab';
import { TokenExplorer } from './AnswerCard';

export function ReplyTokens(props: {
  reply: ModelReply;
  part: 'content' | 'reasoning';
  // Что показать без вероятностей: текст как был.
  fallback: ReactNode;
}): ReactElement {
  const items = props.reply.logprobs?.[props.part];
  const tokens = useMemo(() => (items ?? []).map(toTokenView), [items]);
  return tokens.length === 0 ? <>{props.fallback}</> : <TokenExplorer tokens={tokens} stacked />;
}
