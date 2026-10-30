export interface ModelActor {
  key: string;
  baseUrl: string;
  label: string;
  requested: string;
  returned: string | null;
  provider: string;
}

export interface MessageOrigin {
  actor: ModelActor | null;
  inherited: boolean;
}

export interface ModelActors {
  multiple: boolean;
  requests: Map<string, ModelActor>;
  tools: Map<string, ModelActor>;
  events: Map<number, ModelActor>;
  causes: Map<number, string>;
  inherited: ModelActor[];
  histories: Map<string, Map<string, MessageOrigin>>;
}
