export interface CorrelationData {
  sessions: Set<string>;
  model: Map<string, number>;
  skill: Map<string, number>;
  tool: Map<string, number>;
  agent: Map<string, number>;
  termination: Map<string, number>;
  modelTokens: Map<string, number>;
  skillTokens: Map<string, number>;
  toolTokens: Map<string, number>;
  loopsBySession: Map<string, number>;
  perMessageTokens: number[];
  totalMessages: number;
  delegatedMessages: number;
  traces: number;
  parentSpans: number;
  errorMentions: number;
  signedCustomEvents: number;
  validSignedCustomEvents: number;
  withTokens: number;
  inTok: number;
  outTok: number;
  totalTok: number;
  customEvents: unknown[];
}

export function collectCorrelationData(options: {
  messagesPath: string;
  customEventsPath: string;
  cutoffMs?: number;
}): Promise<CorrelationData>;
