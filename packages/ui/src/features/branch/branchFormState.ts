import type {
  BranchEdit,
  BranchStep,
  ReasoningEffort,
} from '@harness-visualization/harness/branch';
import { useContext, useState } from 'react';
import { getBranchOptions, startBranch } from '../../api/serverApi';
import { markRouteStep } from '../../app/start/route';
import { useLoaded } from '../rag/useRagData';
import { NavigationContext } from './BranchContext';

type BranchOptions = Awaited<ReturnType<typeof getBranchOptions>>;
type ModelOption = BranchOptions['models'][number];
export type BranchChangeKind = 'replay' | 'toolResult';
export type BranchModelChoice = ReturnType<typeof useBranchModelChoice>;
export type BranchEditChoice = ReturnType<typeof useBranchEditChoice>;

export function supportsBranchEffort(
  model: ModelOption | undefined,
  effort: ReasoningEffort,
): boolean {
  if (model === undefined) {
    return false;
  }
  return model.reasoningEfforts.length === 0 || model.reasoningEfforts.includes(effort);
}

function useBranchModelChoice(traceFile: string, step: BranchStep) {
  const options = useLoaded(() => getBranchOptions(traceFile, step.step), [traceFile, step.step]);
  const [chosenModelKey, setModelKey] = useState<string | null>(null);
  const [effort, setEffort] = useState<ReasoningEffort>(step.reasoningEffort);
  const sourceModelKey = options.status === 'ready' ? options.value.sourceKey : null;
  const modelKey = chosenModelKey ?? sourceModelKey ?? '';
  const selectedModel =
    options.status === 'ready'
      ? options.value.models.find((model) => model.key === modelKey)
      : undefined;
  const effortValid = supportsBranchEffort(selectedModel, effort);
  return { options, modelKey, selectedModel, effort, effortValid, setModelKey, setEffort };
}

function useBranchEditChoice(results: BranchStep['toolResults']) {
  const [kind, setKind] = useState<BranchChangeKind>('replay');
  const [toolCallId, setToolCallId] = useState(results.at(-1)?.toolCallId ?? '');
  const [editedResults, setEditedResults] = useState<Record<string, string>>({});
  const original = results.find((result) => result.toolCallId === toolCallId)?.content ?? '';
  const content = editedResults[toolCallId] ?? original;
  const request: BranchEdit =
    kind === 'replay' ? { kind: 'replay' } : { kind: 'toolResult', toolCallId, content };
  const setContent = (value: string): void => {
    setEditedResults((previous) => ({ ...previous, [toolCallId]: value }));
  };
  return { kind, setKind, toolCallId, setToolCallId, content, setContent, results, request };
}

export function useBranchForm(
  traceFile: string,
  step: BranchStep,
): {
  model: BranchModelChoice;
  edit: BranchEditChoice;
  busy: boolean;
  error: string | null;
  canRun: boolean;
  run: () => Promise<void>;
} {
  const navigation = useContext(NavigationContext);
  const model = useBranchModelChoice(traceFile, step);
  const edit = useBranchEditChoice(step.toolResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRun = !busy && model.effortValid && model.selectedModel?.available === true;
  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await startBranch({
        traceFile,
        step: step.step,
        edit: edit.request,
        modelKey: model.modelKey,
        reasoningEffort: model.effort,
      });
      markRouteStep('branch');
      navigation?.openSession(response.sessionId);
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return { model, edit, busy, error, canRun, run };
}
