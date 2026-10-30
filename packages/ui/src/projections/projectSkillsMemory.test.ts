import { describe, expect, it } from 'vitest';
import { projectSkillsMemory, skillLoadAt } from './projectSkillsMemory';
import { EventLog, modelRequest, sessionStarted, toolCall, toolCallEvent } from './testEvents';

const skill = (name: string, mode: 'always' | 'on_demand' | 'manual') => ({
  name,
  description: `${name} — описание`,
  mode,
  files: [],
  instructionCharacters: 100,
});

function session(): EventLog {
  const request = {
    ...modelRequest('r1', 1),
    body: {
      messages: [
        {
          role: 'system',
          content:
            'Ты агент.\n/memories/memo.md на начало сессии:\n- помню\n[Конец /memories/memo.md]',
        },
      ],
    },
  };
  const memoryCall = toolCall(
    'm1',
    'memory',
    '{"command":"str_replace","path":"/memories/memo.md","old_str":"помню","new_str":"помню всё"}',
  );
  return new EventLog()
    .add(sessionStarted())
    .add({
      type: 'skill_catalog',
      directory: 'skills',
      skills: [skill('policy-answer', 'on_demand'), skill('meeting-summary', 'manual')],
      problems: [],
    })
    .add({
      type: 'memory_loaded',
      directory: 'memory',
      memoPath: '/memories/memo.md',
      memoCharacters: 6,
      files: ['/memories/memo.md'],
    })
    .add({ type: 'user_message', text: 'вопрос' })
    .add(request)
    .add({ type: 'skill_loaded', name: 'policy-answer', trigger: 'model', files: [] })
    .add(toolCallEvent(memoryCall))
    .add({
      type: 'memory_updated',
      command: 'str_replace',
      path: '/memories/memo.md',
      newPath: null,
    })
    .add({
      type: 'progress_updated',
      path: 'progress.md',
      version: 1,
      goal: 'Ответить',
      steps: [{ title: 'Найти', status: 'done', note: null }],
    });
}

describe('projectSkillsMemory', () => {
  it('каталог, загрузки, memo на старте, правки памяти и план — с местом в сессии', () => {
    const view = projectSkillsMemory(session().events);

    expect(view.catalog?.skills.map((item) => item.name)).toEqual([
      'policy-answer',
      'meeting-summary',
    ]);
    expect(view.loads).toMatchObject([{ name: 'policy-answer', trigger: 'model', place: 'в1 ш1' }]);
    expect(view.memoAtStart).toBe('- помню');
    expect(view.changes).toMatchObject([
      { command: 'str_replace', path: '/memories/memo.md', detail: '«помню» → «помню всё»' },
    ]);
    expect(view.plans).toMatchObject([{ version: 1, goal: 'Ответить', place: 'в1 ш1' }]);
  });

  it('загрузка скилла видна только после того, как повтор до неё дошёл', () => {
    const view = projectSkillsMemory(session().events);
    const load = view.loads[0];

    expect(load).toBeDefined();
    expect(skillLoadAt(view, 'policy-answer', load?.index ?? 0)).toBeNull();
    expect(skillLoadAt(view, 'policy-answer', (load?.index ?? 0) + 1)?.trigger).toBe('model');
  });

  it('трейс до этапа 6b — пустой экран без ошибок', () => {
    const view = projectSkillsMemory(new EventLog().add(sessionStarted()).events);

    expect(view.catalog).toBeNull();
    expect(view.memoAtStart).toBeNull();
  });
});

it('parallel agents keep separate tool links for skills and memory', () => {
  const main = toolCall(
    'main-memory',
    'memory',
    '{"command":"create","path":"/memories/memo.md","file_text":"main"}',
  );
  const sub = toolCall('sub-skill', 'load_skill', '{"name":"policy-answer"}');
  const log = new EventLog()
    .add({ type: 'user_message', text: 'q' })
    .add(toolCallEvent(main))
    .add(toolCallEvent(sub), 'researcher')
    .add({ type: 'memory_updated', command: 'create', path: '/memories/memo.md', newPath: null })
    .add(
      { type: 'skill_loaded', name: 'policy-answer', trigger: 'model', files: [] },
      'researcher',
    );
  const view = projectSkillsMemory(log.events);
  expect(view.changes[0]?.toolCallId).toBe('main-memory');
  expect(view.loads[0]?.toolCallId).toBe('sub-skill');
});
