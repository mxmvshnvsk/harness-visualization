// Решает, можно ли выполнить вызов тула: разрешить, спросить пользователя или запретить.
// Порядок проверки фиксированный и записывается целиком:
//   1. правила по аргументам — первое подходящее;
//   2. правило для конкретного тула;
//   3. классы действий тула — самое строгое из решений;
//   4. решение по умолчанию — для тулов, которые не объявили, что делают.
// Харнесс ничего не «понимает» сам: он применяет правила, которые кто-то написал заранее.

import type { PermissionsSettings, PermissionRule } from '../settings/settingsSchema.js';
import { matchesHostPattern, matchesPathPattern } from './matchPatterns.js';
import type {
  ActionTarget,
  PermissionCheck,
  PermissionDecision,
  PermissionEvaluation,
  ToolEffect,
} from './permissionTypes.js';

export interface PermissionRequest {
  toolName: string;
  effects: readonly ToolEffect[];
  targets: ActionTarget[];
}

// Чем строже решение, тем больше число: при нескольких классах действий побеждает строгое.
const DECISION_STRICTNESS: Record<PermissionDecision, number> = { allow: 0, ask: 1, deny: 2 };

export function evaluatePermission(
  request: PermissionRequest,
  policy: PermissionsSettings,
): PermissionEvaluation {
  const checks: PermissionCheck[] = [];

  const matchedRule = checkRules(request, policy.rules, checks);
  if (matchedRule !== null) {
    return {
      decision: matchedRule.decision,
      reason: `Сработало правило «${matchedRule.description}»`,
      checks,
    };
  }

  const toolDecision = policy.tools[request.toolName];
  if (toolDecision !== undefined) {
    checks.push({
      source: 'tool',
      label: `правило для тула ${request.toolName}`,
      matched: true,
      decision: toolDecision,
    });
    return {
      decision: toolDecision,
      reason: `Для тула ${request.toolName} задано «${toolDecision}»`,
      checks,
    };
  }

  if (request.effects.length > 0) {
    return decideByEffects(request.effects, policy, checks);
  }

  checks.push({
    source: 'default',
    label: 'решение по умолчанию',
    matched: true,
    decision: policy.defaultDecision,
  });
  return {
    decision: policy.defaultDecision,
    reason: `Тул не объявил, что делает, — решение по умолчанию «${policy.defaultDecision}»`,
    checks,
  };
}

function checkRules(
  request: PermissionRequest,
  rules: PermissionRule[],
  checks: PermissionCheck[],
): PermissionRule | null {
  for (const rule of rules) {
    const matched = ruleMatches(rule, request);
    checks.push({
      source: 'rule',
      label: rule.description,
      matched,
      decision: matched ? rule.decision : null,
    });
    if (matched) {
      return rule;
    }
  }
  return null;
}

// Правило подходит, если выполнены все заданные в нём условия.
function ruleMatches(rule: PermissionRule, request: PermissionRequest): boolean {
  if (rule.tool !== undefined && rule.tool !== request.toolName) {
    return false;
  }
  if (rule.effect !== undefined && !request.effects.includes(rule.effect)) {
    return false;
  }
  if (rule.pathPattern !== undefined && !hasMatchingPath(request.targets, rule.pathPattern)) {
    return false;
  }
  if (rule.hostPattern !== undefined && !hasMatchingHost(request.targets, rule.hostPattern)) {
    return false;
  }
  return true;
}

function hasMatchingPath(targets: ActionTarget[], pattern: string): boolean {
  return targets.some(
    (target) => target.kind === 'path' && matchesPathPattern(target.path, pattern),
  );
}

function hasMatchingHost(targets: ActionTarget[], pattern: string): boolean {
  return targets.some(
    (target) => target.kind === 'host' && matchesHostPattern(target.host, pattern),
  );
}

function decideByEffects(
  effects: readonly ToolEffect[],
  policy: PermissionsSettings,
  checks: PermissionCheck[],
): PermissionEvaluation {
  let strictestEffect: ToolEffect | null = null;
  let strictestDecision: PermissionDecision = 'allow';
  for (const effect of effects) {
    const decision = policy.effects[effect];
    checks.push({ source: 'effect', label: `класс действия: ${effect}`, matched: true, decision });
    if (
      strictestEffect === null ||
      DECISION_STRICTNESS[decision] > DECISION_STRICTNESS[strictestDecision]
    ) {
      strictestEffect = effect;
      strictestDecision = decision;
    }
  }
  return {
    decision: strictestDecision,
    reason: `Класс действия ${strictestEffect ?? 'unknown'} → «${strictestDecision}»`,
    checks,
  };
}
