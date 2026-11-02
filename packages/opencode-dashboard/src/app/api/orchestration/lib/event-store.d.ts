export interface EventRecord {
  timestamp?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  model?: string;
  skill?: string;
  tool?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  iteration_index?: number;
  termination_reason?: string;
  provenance?: {
    source?: string;
    event_hash?: string;
    signature?: string;
    signature_valid?: boolean;
    signing_algorithm?: string;
    received_at?: string;
    signer?: string;
  };
}

export interface NormalizationDiagnostics {
  unsigned: number;
  invalid_signature: number;
  accepted_signed: number;
  accepted_unsigned: number;
}

export interface NormalizeEventsResult {
  normalized: EventRecord[];
  normalizationDiagnostics: NormalizationDiagnostics;
}

export interface EventProvenance {
  signing_enabled: boolean;
  signed_events: number;
  valid_signed_events: number;
  diagnostics: NormalizationDiagnostics;
}

export function normalizeEvents(options: {
  incoming: EventRecord[];
  signingKey: string;
  signingMode: 'off' | 'allow-unsigned' | 'require-signed' | 'require-valid-signature';
  defaultSource: string;
}): NormalizeEventsResult;

export function persistEvents(options: {
  filePath: string;
  version?: string;
  existingEvents: EventRecord[];
  replace: boolean;
  normalized: EventRecord[];
  maxEvents?: number;
}): Promise<EventRecord[]>;

export function summarizeEventProvenance(options: {
  normalized: EventRecord[];
  signingKey: string;
  diagnostics: NormalizationDiagnostics;
}): EventProvenance;
