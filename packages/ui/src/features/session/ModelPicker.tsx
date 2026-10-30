import type { ReactElement } from 'react';
import type { ModelOption } from '@harness-visualization/harness';
import { SelectField } from '../../components/SelectField';
import { selectedSessionModel, type ChoicesState } from './sessionChoices';

export function ModelPicker({ state }: { state: ChoicesState }): ReactElement {
  const { options, choices } = state;
  const orchestrated = choices.demoProject && choices.orchestration;
  const selected = selectedSessionModel(state);
  return (
    <SelectField
      label="Модель"
      accessibleLabel="Модель для новой сессии"
      value={selected?.key ?? choices.modelKey}
      disabled={options === null || orchestrated}
      hint={orchestrated ? 'В оркестрации пока используется модель по умолчанию.' : undefined}
      options={
        options?.models.map((model) => ({
          value: model.key,
          label: describeOption(model),
          disabled: !model.available,
        })) ?? [{ value: choices.modelKey, label: 'Загрузка…' }]
      }
      onChange={(modelKey) => state.change({ modelKey })}
    />
  );
}

function describeOption(model: ModelOption): string {
  const label = `${model.label} · ${model.providerName}`;
  return model.available ? label : `${label} · нет ${model.apiKeyVariable}`;
}
