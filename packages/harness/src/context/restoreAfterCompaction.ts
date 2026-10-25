// Что вернуть в prompt после компакции (этап 6b.4). Сводка пересказывает прошлые ходы своими
// словами — и теряет то, что должно остаться дословно: инструкции загруженных скиллов, план
// и память, изменённую по ходу сессии. Харнесс знает их сам и дописывает к сводке как есть,
// не полагаясь на пересказ модели.

import type { AgentDependencies } from '../agent/agentDependencies.js';
import { MEMO_PATH } from '../memory/memoryPaths.js';
import type { ChatMessage } from '../model/chatTypes.js';
import { PROGRESS_PATH, renderProgress } from '../progress/ProgressTracker.js';
import { skillBlock } from '../skills/skillPrompt.js';
import { SUMMARY_PREFIX } from './compactHistory.js';

export interface RestoredContext {
  // memo.md изменился за сессию — в system prompt он старый, вернули текущий.
  memo: boolean;
  progress: boolean;
  // Скиллы, чьи инструкции ушли вместе со сжатыми ходами.
  skills: string[];
}

type RestoreDependencies = Pick<AgentDependencies, 'memory' | 'progress' | 'skills'>;

export async function restoreAfterCompaction(
  messages: ChatMessage[],
  dependencies: RestoreDependencies,
): Promise<RestoredContext> {
  const summary = messages.find(
    (message) => message.role === 'user' && message.content.startsWith(SUMMARY_PREFIX),
  );
  if (summary?.role !== 'user') {
    return { memo: false, progress: false, skills: [] };
  }
  const memo = await changedMemo(dependencies);
  const plan = dependencies.progress.current;
  const skills = lostSkills(messages, dependencies);
  const blocks = [
    ...(memo === null ? [] : [`${MEMO_PATH} сейчас:\n${memo.trim()}`]),
    ...(plan === null ? [] : [`План (${PROGRESS_PATH}):\n${renderProgress(plan).trim()}`]),
    ...skills.map((skill) =>
      skillBlock(skill, 'загружен раньше, возвращён после сжатия').join('\n'),
    ),
  ];
  if (blocks.length > 0) {
    summary.content = [
      summary.content,
      '',
      '[Харнесс вернул после сжатия — это не пересказ, а текущее состояние]',
      ...blocks.flatMap((block) => ['', block]),
    ].join('\n');
  }
  return {
    memo: memo !== null,
    progress: plan !== null,
    skills: skills.map((skill) => skill.name),
  };
}

// memo.md в system prompt — на начало сессии. Изменился — возвращаем текущий.
async function changedMemo({ memory }: RestoreDependencies): Promise<string | null> {
  const current = await memory.store.readOrNull(MEMO_PATH);
  return current === null || current === memory.memoAtStart ? null : current;
}

// Загруженные скиллы, инструкций которых в истории больше нет. always — в system prompt,
// загруженные в текущем ходе — в его сообщениях: их возвращать незачем.
function lostSkills(messages: ChatMessage[], { skills }: RestoreDependencies) {
  const texts = messages.map((message) => message.content ?? '').join('\n');
  return skills
    .loaded()
    .filter((skill) => skill.mode !== 'always' && !texts.includes(skill.instructions));
}
