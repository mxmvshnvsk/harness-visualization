// Список тулов, доступных агенту. Из него строятся описания для модели,
// и по нему харнесс находит тул, который модель попросила вызвать.

import type { ToolDefinition } from '../model/chatTypes.js';
import type { Tool } from './toolTypes.js';

export class ToolRegistry {
  private readonly toolsByName = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new Error(`Тул «${tool.name}» уже зарегистрирован`);
    }
    this.toolsByName.set(tool.name, tool);
  }

  find(name: string): Tool | undefined {
    return this.toolsByName.get(name);
  }

  names(): string[] {
    return [...this.toolsByName.keys()];
  }

  definitions(): ToolDefinition[] {
    return [...this.toolsByName.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    }));
  }
}
