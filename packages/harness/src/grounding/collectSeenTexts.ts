// Тексты, которые модель на самом деле получила в сессии, — по трейсу. С ними и сравниваются
// claims ответа: модель могла опереться только на то, что ей показали. Источник правды —
// content событий: ровно то, что харнесс отправил модели.
//   - tool_result со статусом success — то, что вернул тул по просьбе модели;
//   - context_retrieved со статусом success — то, что харнесс нашёл сам и подмешал (5.3).

import type { HarnessEvent } from '../events/harnessEvents.js';
import type { SeenText } from './claimTypes.js';
import { sourceLevelOfTool } from './collectSeenSources.js';

export function collectSeenTexts(events: HarnessEvent[]): SeenText[] {
  const texts: SeenText[] = [];
  for (const event of events) {
    if (event.type === 'tool_result' && event.status === 'success') {
      const level = sourceLevelOfTool(event.toolName);
      if (level !== null && level !== 'notSeen') {
        texts.push({
          eventSequence: event.sequence,
          toolName: event.toolName,
          calledBy: 'model',
          level,
          text: event.content,
        });
      }
    }
    if (event.type === 'context_retrieved' && event.status === 'success') {
      texts.push({
        eventSequence: event.sequence,
        toolName: event.toolName,
        calledBy: 'harness',
        level: 'fragment',
        text: event.content,
      });
    }
  }
  return texts;
}
