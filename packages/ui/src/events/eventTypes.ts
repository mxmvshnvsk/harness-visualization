import type { HarnessEvent, HarnessEventType } from '@harness-visualization/harness';

// Событие одного типа: EventOfType<'tool_call'> — с полями именно tool_call.
export type EventOfType<Type extends HarnessEventType> = Extract<HarnessEvent, { type: Type }>;
