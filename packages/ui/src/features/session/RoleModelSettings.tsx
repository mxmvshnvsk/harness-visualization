import { useId, useState, type ReactElement } from 'react';
import { SelectField } from '../../components/SelectField';
import type { ChoicesState } from './sessionChoices';
import {
  activeRoleModels,
  modelOptionLabel,
  roleModelError,
  type RoleModelChoice,
} from './roleModelChoices';
import styles from './RoleModelSettings.module.css';

const INHERIT_MODEL = '';

export function RoleModelSettings({ state }: { state: ChoicesState }): ReactElement | null {
  const id = useId();
  const [open, setOpen] = useState(false);
  const roles = activeRoleModels(state);
  const available = state.options?.models.filter((model) => model.available).length ?? 0;
  const hasError = roles.some((role) => roleModelError(role) !== null);
  if (roles.length === 0 || (available < 2 && !hasError)) {
    return null;
  }
  return (
    <section className={styles.roles} aria-labelledby={id}>
      <div className={styles.heading}>
        <h4 id={id}>Модели по ролям</h4>
        <span>Для этой сессии</span>
        <button
          type="button"
          className={styles.collapse}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Свернуть' : 'Развернуть'}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div id={`${id}-body`} className={styles.body} hidden={!open}>
        {roles.map((role) => (
          <RoleModelRow
            key={role.orchestrator ? 'orchestrator' : `subagent:${role.name}`}
            role={role}
            state={state}
          />
        ))}
        <p className={styles.note}>
          «Как у сессии» берёт модель, выбранную ниже. У исследователя она не зависит от модели
          оркестратора.
        </p>
      </div>
    </section>
  );
}

function RoleModelRow({
  role,
  state,
}: {
  role: RoleModelChoice;
  state: ChoicesState;
}): ReactElement {
  const options = roleSelectOptions(role, state);
  const model = role.model;
  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        <span>{role.label}</span>
        {!role.orchestrator && <code>{role.name}</code>}
        <span className={styles.note}>{role.description}</span>
      </div>
      <div className={styles.model}>
        <SelectField
          hideLabel
          label="Модель"
          accessibleLabel={`Модель: ${role.label}`}
          value={role.modelKey ?? INHERIT_MODEL}
          options={[{ value: INHERIT_MODEL, label: 'Как у сессии' }, ...options]}
          onChange={(key) => changeRoleModel(state, role, key === INHERIT_MODEL ? null : key)}
        />
        <span className={styles.note} aria-live="polite">
          {resolvedModelLabel(role)}
        </span>
      </div>
      <div className={styles.effort}>
        <span>
          {model?.reasoningEfforts.length === 0 ? 'effort не передаётся' : `effort ${role.effort}`}
        </span>
        <span className={styles.note}>
          {role.orchestrator ? 'как у сессии' : 'из настроек роли'}
        </span>
      </div>
    </div>
  );
}

function roleSelectOptions(role: RoleModelChoice, state: ChoicesState) {
  const options =
    state.options?.models.map((model) => ({
      value: model.key,
      label: modelOptionLabel(model),
      disabled: !model.available,
    })) ?? [];
  if (role.modelKey !== null && !options.some((option) => option.value === role.modelKey)) {
    options.push({
      value: role.modelKey,
      label: `${role.modelKey} · удалена из реестра`,
      disabled: true,
    });
  }
  return options;
}

function resolvedModelLabel(role: RoleModelChoice): string {
  if (role.model === undefined) {
    return 'Модель недоступна';
  }
  return role.modelKey === null
    ? `${role.model.label} · ${role.model.providerName}`
    : role.model.model;
}

function changeRoleModel(
  state: ChoicesState,
  role: RoleModelChoice,
  modelKey: string | null,
): void {
  const selected = state.choices.roleModels ?? {};
  const roleModels = { ...selected };
  if (role.orchestrator) {
    roleModels.orchestrator = modelKey;
  } else {
    roleModels.subagents = { ...selected.subagents, [role.name]: modelKey };
  }
  state.change({ roleModels });
}
