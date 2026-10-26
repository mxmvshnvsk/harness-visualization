// Сессия без демо-проекта — в своей подпапке workspaces/blank/<имя трейса>; ветка такой
// сессии начинает с копии её папки.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blankSourceDirectory } from '../branch/branchInput.js';
import type { HarnessEvent } from '../events/harnessEvents.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { withOwnBlankWorkspace, type SessionInput } from './startSession.js';

const loadedSettings = {
  settings: { workspace: { blankDirectory: 'workspaces/blank' } },
} as unknown as LoadedSettings;

function input(overrides: Partial<SessionInput>): SessionInput {
  return {
    loadedSettings,
    demoProject: false,
    workspaceDirectory: null,
    arena: null,
    ...overrides,
  } as SessionInput;
}

function prepared(directory: string): HarnessEvent[] {
  return [
    { type: 'workspace_prepared', directory, createdFromSeed: false, wasReset: false },
  ] as unknown as HarnessEvent[];
}

describe('Папка сессии без демо-проекта', () => {
  it('своя подпапка по имени трейса', () => {
    const result = withOwnBlankWorkspace(input({}), '2026-10-26T20-00-00_abcd1234');
    assert.equal(result.workspaceDirectory, 'workspaces/blank/2026-10-26T20-00-00_abcd1234');
  });

  it('демо-проект, арена и явно заданная папка не меняются', () => {
    for (const overrides of [
      { demoProject: true },
      { arena: {} as SessionInput['arena'] },
      { workspaceDirectory: '/tmp/trial-1' },
    ]) {
      const original = input(overrides);
      assert.equal(withOwnBlankWorkspace(original, 'name'), original);
    }
  });

  it('ветка берёт за основу папку исходной сессии, но не старую общую', () => {
    const own = 'workspaces/blank/2026-10-26T20-00-00_abcd1234';
    assert.equal(blankSourceDirectory(prepared(own), loadedSettings), own);
    assert.equal(blankSourceDirectory(prepared('workspace-blank'), loadedSettings), null);
    assert.equal(blankSourceDirectory(prepared('workspaces/demo'), loadedSettings), null);
    assert.equal(blankSourceDirectory([], loadedSettings), null);
  });
});
