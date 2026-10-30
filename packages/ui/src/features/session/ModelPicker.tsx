import type { ReactElement } from 'react';
import { SelectField } from '../../components/SelectField';
import { selectedSessionModel, type ChoicesState } from './sessionChoices';
import { modelOptionLabel } from './roleModelChoices';

export function ModelPicker({ state }: { state: ChoicesState }): ReactElement {
  const { options, choices } = state;
  const selected = selectedSessionModel(state);
  return (
    <SelectField
      label="Модель сессии"
      accessibleLabel="Модель для новой сессии"
      value={selected?.key ?? choices.modelKey}
      disabled={options === null}
      options={
        options?.models.map((model) => ({
          value: model.key,
          label: modelOptionLabel(model),
          disabled: !model.available,
        })) ?? [{ value: choices.modelKey, label: 'Загрузка…' }]
      }
      onChange={(modelKey) => state.change({ modelKey })}
    />
  );
}
