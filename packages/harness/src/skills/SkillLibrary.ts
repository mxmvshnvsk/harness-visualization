// Скиллы сессии: каталог, что уже загружено и кем. Загрузка — одно место для всех путей
// (always при старте, load_skill модели, «/имя» пользователя): здесь же событие skill_loaded,
// поэтому в трейсе видно каждую загрузку и кто её сделал.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventStream } from '../events/EventStream.js';
import { ToolError } from '../tools/ToolError.js';
import type { SkillCatalog } from './loadSkills.js';
import type { Skill, SkillTrigger } from './skillTypes.js';

// Дополнительный файл скилла целиком в контекст не кладём, как и read_file.
const MAX_FILE_CHARACTERS = 20_000;

export class SkillLibrary {
  private readonly loadedNames = new Set<string>();

  constructor(
    private readonly catalog: SkillCatalog,
    private readonly events: EventStream,
  ) {}

  get skills(): readonly Skill[] {
    return this.catalog.skills;
  }

  // Каталог для модели: скиллы on_demand. manual в нём нет — их зовёт только пользователь.
  onDemand(): Skill[] {
    return this.catalog.skills.filter((skill) => skill.mode === 'on_demand');
  }

  always(): Skill[] {
    return this.catalog.skills.filter((skill) => skill.mode === 'always');
  }

  find(name: string): Skill | null {
    return this.catalog.skills.find((skill) => skill.name === name) ?? null;
  }

  // Загруженные — в порядке загрузки; после компакции харнесс вернёт их в prompt (этап 6b).
  loaded(): Skill[] {
    return [...this.loadedNames].flatMap((name) => this.find(name) ?? []);
  }

  load(skill: Skill, trigger: SkillTrigger): void {
    this.loadedNames.add(skill.name);
    this.events.emit({ type: 'skill_loaded', name: skill.name, trigger, files: skill.files });
  }

  // Скилл для модели: только из каталога, manual — только по команде пользователя.
  requireForModel(name: string): Skill {
    const skill = this.find(name);
    if (skill === null || skill.mode === 'manual') {
      const names = this.onDemand().map((item) => item.name);
      throw new ToolError(
        `Скилла «${name}» нет в каталоге. Доступны: ${names.join(', ') || 'нет скиллов'}.`,
      );
    }
    return skill;
  }

  async readFile(skill: Skill, path: string): Promise<string> {
    // Только файлы из списка скилла: так путь не выйдет за его папку.
    if (!skill.files.includes(path)) {
      throw new ToolError(
        `У скилла ${skill.name} нет файла «${path}». Файлы: ${skill.files.join(', ') || 'нет'}.`,
      );
    }
    const text = await readFile(join(skill.directory, path), 'utf8');
    if (text.length <= MAX_FILE_CHARACTERS) {
      return text;
    }
    return `${text.slice(0, MAX_FILE_CHARACTERS)}\n\n[Файл обрезан: показано ${String(MAX_FILE_CHARACTERS)} из ${String(text.length)} символов]`;
  }
}
