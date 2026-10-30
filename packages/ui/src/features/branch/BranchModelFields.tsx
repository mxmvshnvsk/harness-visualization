import { REASONING_EFFORTS } from '@harness-visualization/harness/branch';
import type { ReactElement } from 'react';
import { SelectField } from '../../components/SelectField';
import { supportsBranchEffort, type BranchModelChoice } from './branchFormState';
import styles from './Branch.module.css';

export function BranchModelFields({ choice }: { choice: BranchModelChoice }): ReactElement {
  const { options, selectedModel, effortValid, modelKey } = choice;
  if (options.status !== 'ready') {
    const message = options.status === 'loading' ? 'Загружаем модели…' : options.message;
    return <p className={styles.muted}>{message}</p>;
  }
  const source = options.value.source;
  const modelChanged = modelKey !== '' && modelKey !== options.value.sourceKey;
  return (
    <>
      <p className={styles.muted}>
        Исходная модель: {source.model} · {source.providerName}
      </p>
      {options.value.sourceKey === null && (
        <p className={styles.note}>
          Исходная модель отсутствует или неоднозначна в текущем реестре. Выберите модель явно.
        </p>
      )}
      <BranchModelSelect choice={choice} models={options.value.models} />
      <BranchEffortSelect choice={choice} />
      {selectedModel !== undefined && !effortValid && (
        <p className={styles.error}>
          Выберите поддерживаемый effort. Уровень исходного шага не меняется автоматически.
        </p>
      )}
      {modelChanged && (
        <p className={styles.note}>
          История сохраняется, рассуждения и подписи исходной модели удаляются. Совместимость
          проверяется до запуска.
        </p>
      )}
    </>
  );
}

function BranchModelSelect({
  choice,
  models,
}: {
  choice: BranchModelChoice;
  models: { key: string; label: string; providerName: string; available: boolean }[];
}): ReactElement {
  const options = models.map((model) => ({
    value: model.key,
    label: `${model.label} · ${model.providerName}${model.available ? '' : ' — нет ключа'}`,
    disabled: !model.available,
  }));
  return (
    <SelectField
      label="Модель ветки"
      value={choice.modelKey}
      onChange={choice.setModelKey}
      options={[{ value: '', label: 'Выберите модель', disabled: true }, ...options]}
    />
  );
}

function BranchEffortSelect({ choice }: { choice: BranchModelChoice }): ReactElement {
  const options = REASONING_EFFORTS.map((value) => ({
    value,
    label: value,
    disabled:
      choice.selectedModel !== undefined && !supportsBranchEffort(choice.selectedModel, value),
  }));
  return (
    <SelectField
      label="Reasoning effort"
      width={180}
      value={choice.effort}
      onChange={choice.setEffort}
      options={options}
    />
  );
}
