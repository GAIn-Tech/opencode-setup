'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

type ConfigKey =
  | 'projectConfig'
  | 'userConfig'
  | 'ohMyConfig'
  | 'compoundConfig'
  | 'rateLimitFallback'
  | 'modelPolicies'
  | 'antigravity'
  | 'supermemory'
  | 'deploymentState'
  | 'learningUpdatePolicy'
  | 'sessionBudgets';

interface ConfigSource {
  path: string;
  data: unknown;
}

type ConfigData = Record<ConfigKey, ConfigSource>;

interface ConfigSection {
  key: ConfigKey;
  name: string;
  icon: string;
  description: string;
}

const sections: ConfigSection[] = [
  { key: 'projectConfig', name: 'Project Config', icon: '📁', description: 'Project-level OpenCode settings' },
  { key: 'userConfig', name: 'User Config', icon: '👤', description: 'User-level OpenCode settings' },
  { key: 'ohMyConfig', name: 'Oh-My-OpenCode', icon: '⚡', description: 'Agent and MCP toggles' },
  { key: 'compoundConfig', name: 'Compound Engineering', icon: '🔧', description: 'Skills and commands registry' },
  { key: 'rateLimitFallback', name: 'Rate Limits & Fallback', icon: '🛡️', description: 'Fallback model and retry policy' },
  { key: 'modelPolicies', name: 'Model Policies', icon: '🤖', description: 'Router intents, tiers, and model metadata' },
  { key: 'antigravity', name: 'Antigravity', icon: '🚀', description: 'Quota scheduling and rotation behavior' },
  { key: 'supermemory', name: 'Supermemory', icon: '🧠', description: 'Long-term memory plugin settings' },
  { key: 'deploymentState', name: 'Deployment State', icon: '📦', description: 'Environment versions and history' },
  { key: 'learningUpdatePolicy', name: 'Learning Policy', icon: '📚', description: 'Governance validation policy' },
  { key: 'sessionBudgets', name: 'Session Budgets', icon: '💰', description: 'Per-session model budgets' },
];

const anyRecord = z.record(z.any());

const projectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    model: z.string().optional(),
    plugin: z.array(z.string()).optional(),
    apiKeys: z.record(z.string()).optional(),
    env: z.record(z.string()).optional(),
    provider: anyRecord.optional(),
    command: anyRecord.optional(),
    mcp: anyRecord.optional(),
    permission: anyRecord.optional(),
  })
  .passthrough();

const userConfigSchema = projectConfigSchema;

const ohMyConfigSchema = z
  .object({
    $schema: z.string().optional(),
    google_auth: z.boolean().optional(),
    agents: z
      .object({
        enabled: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    mcp: z.record(z.object({ enabled: z.boolean().optional() }).passthrough()).optional(),
    hooks: anyRecord.optional(),
  })
  .passthrough();

const compoundConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    source: z.string().optional(),
    scope: z.string().optional(),
    available: z.boolean().optional(),
    skills: anyRecord.optional(),
    commands: anyRecord.optional(),
    integration: anyRecord.optional(),
    usage: anyRecord.optional(),
  })
  .passthrough();

const rateLimitFallbackSchema = z
  .object({
    enabled: z.boolean(),
    fallbackMode: z.string(),
    cooldownMs: z.number().min(0),
    fallbackModels: z.array(
      z.object({
        providerID: z.string(),
        modelID: z.string(),
      })
    ),
    retryPolicy: z
      .object({
        maxRetries: z.number().min(0),
        strategy: z.string(),
        baseDelayMs: z.number().min(0),
        maxDelayMs: z.number().min(0),
        jitterEnabled: z.boolean(),
        jitterFactor: z.number().min(0),
        timeoutMs: z.number().min(0),
      })
      .passthrough(),
    circuitBreaker: z
      .object({
        enabled: z.boolean(),
        failureThreshold: z.number().min(0),
        recoveryTimeoutMs: z.number().min(0),
        halfOpenMaxCalls: z.number().min(0),
        successThreshold: z.number().min(0),
      })
      .passthrough(),
    enableSubagentFallback: z.boolean().optional(),
    maxSubagentDepth: z.number().min(0).optional(),
  })
  .passthrough();

const modelPoliciesSchema = z
  .object({
    version: z.string().optional(),
    description: z.string().optional(),
    intentRouting: anyRecord.optional(),
    models: anyRecord.optional(),
    cost_tiers: anyRecord.optional(),
    complexity_routing: anyRecord.optional(),
    tuning: anyRecord.optional(),
  })
  .passthrough();

const antigravitySchema = z
  .object({
    $schema: z.string().optional(),
    account_selection_strategy: z.string().optional(),
    scheduling_mode: z.string().optional(),
    max_cache_first_wait_seconds: z.number().min(0).optional(),
    quota_fallback: z.boolean().optional(),
    cli_first: z.boolean().optional(),
    switch_on_first_rate_limit: z.boolean().optional(),
    soft_quota_threshold_percent: z.number().min(0).max(100).optional(),
    quota_refresh_interval_minutes: z.number().min(0).optional(),
    soft_quota_cache_ttl_minutes: z.union([z.number().min(0), z.literal('auto')]).optional(),
    max_rate_limit_wait_seconds: z.number().min(0).optional(),
    session_recovery: z.boolean().optional(),
    auto_resume: z.boolean().optional(),
    proactive_token_refresh: z.boolean().optional(),
    proactive_refresh_buffer_seconds: z.number().min(0).optional(),
    proactive_refresh_check_interval_seconds: z.number().min(0).optional(),
    debug: z.boolean().optional(),
    quiet_mode: z.boolean().optional(),
    toast_scope: z.string().optional(),
    auto_update: z.boolean().optional(),
  })
  .passthrough();

const supermemorySchema = z
  .object({
    $schema: z.string().optional(),
    apiKey: z.string().optional(),
    autoIndex: z.boolean().optional(),
    contextInjection: z.boolean().optional(),
    injectProfile: z.boolean().optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    maxMemories: z.number().min(0).optional(),
    keywordPatterns: z.array(z.string()).optional(),
    compactionThreshold: z.number().min(0).max(1).optional(),
  })
  .passthrough();

const deploymentStateSchema = z
  .object({
    version: z.number().optional(),
    environments: z.record(
      z.object({
        version: z.string().optional(),
        sha: z.string().optional(),
        updated_at: z.string().nullable().optional(),
        updated_by: z.string().nullable().optional(),
      })
    ),
    history: z.array(anyRecord).optional(),
  })
  .passthrough();

const learningUpdatePolicySchema = z
  .object({
    version: z.number().optional(),
    governed_paths: z.array(z.string()),
    required_update_fields: z.array(z.string()),
    required_validation_fields: z.array(z.string()),
    allowed_validation_status: z.array(z.string()),
    allowed_risk_levels: z.array(z.string()),
    require_pass_for_risk: z.record(z.array(z.string())),
  })
  .passthrough();

const sessionBudgetsSchema = z
  .object({
    sessions: z.record(z.record(z.number())),
    savedAt: z.string().optional(),
  })
  .passthrough();

const domainSchemas: Record<ConfigKey, z.ZodTypeAny> = {
  projectConfig: projectConfigSchema,
  userConfig: userConfigSchema,
  ohMyConfig: ohMyConfigSchema,
  compoundConfig: compoundConfigSchema,
  rateLimitFallback: rateLimitFallbackSchema,
  modelPolicies: modelPoliciesSchema,
  antigravity: antigravitySchema,
  supermemory: supermemorySchema,
  deploymentState: deploymentStateSchema,
  learningUpdatePolicy: learningUpdatePolicySchema,
  sessionBudgets: sessionBudgetsSchema,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function deepClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function toLines(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join('\n') : '';
}

function fromLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseNumber(value: string, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function JsonTree({ data, searchTerm = '' }: { data: unknown; searchTerm?: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const renderValue = (value: unknown, key: string, path: string): JSX.Element => {
    const fullPath = path ? `${path}.${key}` : key;
    const isMatch =
      searchTerm &&
      (key.toLowerCase().includes(searchTerm.toLowerCase()) || String(value).toLowerCase().includes(searchTerm.toLowerCase()));

    if (value === null) return <span className="text-zinc-500">null</span>;
    if (typeof value === 'boolean') return <span className="text-purple-400">{String(value)}</span>;
    if (typeof value === 'number') return <span className="text-yellow-400">{value}</span>;
    if (typeof value === 'string') {
      return <span className={`text-green-400 ${isMatch ? 'bg-yellow-500/30' : ''}`}>"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-zinc-500">[]</span>;
      const isCollapsed = collapsed.has(fullPath);
      return (
        <span>
          <button onClick={() => toggleCollapse(fullPath)} className="text-zinc-400 hover:text-white">
            {isCollapsed ? '▶' : '▼'}
          </button>
          {' ['}
          {isCollapsed ? (
            <span className="text-zinc-500">...{value.length} items</span>
          ) : (
            <div className="pl-4">
              {value.map((item, i) => (
                <div key={i}>
                  {renderValue(item, String(i), fullPath)}
                  {i < value.length - 1 && ','}
                </div>
              ))}
            </div>
          )}
          {']'}
        </span>
      );
    }

    if (isRecord(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) return <span className="text-zinc-500">{'{}'}</span>;
      const isCollapsed = collapsed.has(fullPath);
      return (
        <span>
          <button onClick={() => toggleCollapse(fullPath)} className="text-zinc-400 hover:text-white">
            {isCollapsed ? '▶' : '▼'}
          </button>
          {' {'}
          {isCollapsed ? (
            <span className="text-zinc-500">...{entries.length} keys</span>
          ) : (
            <div className="pl-4">
              {entries.map(([k, v], i) => {
                const keyMatch = searchTerm && k.toLowerCase().includes(searchTerm.toLowerCase());
                return (
                  <div key={k}>
                    <span className={`text-blue-400 ${keyMatch ? 'bg-yellow-500/30' : ''}`}>"{k}"</span>
                    <span className="text-zinc-400">: </span>
                    {renderValue(v, k, fullPath)}
                    {i < entries.length - 1 && ','}
                  </div>
                );
              })}
            </div>
          )}
          {'}'}
        </span>
      );
    }

    return <span className="text-zinc-300">{String(value)}</span>;
  };

  return <div className="font-mono text-sm">{renderValue(data, '', '')}</div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: JSX.Element }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
      {error ? <div className="text-xs text-red-500">{error}</div> : null}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none ${props.className || ''}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none ${props.className || ''}`}
    />
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500"
    />
  );
}

function JsonArea({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
  }, [value]);

  return (
    <div className="space-y-1">
      <Textarea
        value={text}
        onChange={(e) => {
          const nextText = e.target.value;
          setText(nextText);
          try {
            const parsed = JSON.parse(nextText);
            onChange(parsed);
            setError(null);
          } catch {
            setError('Invalid JSON');
          }
        }}
        rows={10}
        className="font-mono text-xs"
      />
      {error ? <div className="text-xs text-red-500">{error}</div> : null}
    </div>
  );
}

function SecretRecordEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const entries = Object.entries(value);

  return (
    <div className="space-y-2">
      {entries.length === 0 ? <div className="text-xs text-zinc-500">No keys configured.</div> : null}
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-12 gap-2">
          <Input
            value={k}
            onChange={(e) => {
              const nextKey = e.target.value.trim();
              const next = { ...value };
              delete next[k];
              if (nextKey) next[nextKey] = v;
              onChange(next);
            }}
            className="col-span-4"
          />
          <Input
            type={visible[k] ? 'text' : 'password'}
            value={v}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            className="col-span-6"
          />
          <button
            type="button"
            onClick={() => setVisible((prev) => ({ ...prev, [k]: !prev[k] }))}
            className="col-span-1 rounded bg-zinc-700 text-xs text-zinc-100 hover:bg-zinc-600"
          >
            {visible[k] ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
            className="col-span-1 rounded bg-red-700/70 text-xs text-red-100 hover:bg-red-600/70"
          >
            X
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, NEW_KEY: '' })}
        className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
      >
        Add key
      </button>
    </div>
  );
}

export function ConfigViewer() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'raw' | 'form'>('raw');
  const [selectedDomain, setSelectedDomain] = useState<ConfigKey>('projectConfig');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const [editingKey, setEditingKey] = useState<ConfigKey | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formDraft, setFormDraft] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formSaveError, setFormSaveError] = useState<string | null>(null);
  const [formSaveSuccess, setFormSaveSuccess] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const activeSection = useMemo(() => sections.find((s) => s.key === selectedDomain), [selectedDomain]);

  const hydrateFormDraft = useCallback(
    (nextData: ConfigData | null, domain: ConfigKey) => {
      const source = nextData?.[domain]?.data;
      setFormDraft(ensureRecord(deepClone(source ?? {})));
      setFormErrors([]);
      setFormSaveError(null);
      setFormSaveSuccess(null);
    },
    []
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const json = (await res.json()) as ConfigData;
      setData(json);
      if (expandedSections.size === 0) {
        setExpandedSections(new Set(sections.slice(0, 3).map((s) => s.key)));
      }
      if (mode === 'form') {
        hydrateFormDraft(json, selectedDomain);
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [expandedSections.size, hydrateFormDraft, mode, selectedDomain]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (mode === 'form') {
      hydrateFormDraft(data, selectedDomain);
    }
  }, [data, hydrateFormDraft, mode, selectedDomain]);

  const saveConfig = useCallback(
    async (configKey: ConfigKey, payload: unknown) => {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configKey, data: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
    },
    []
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setExpandedSections(next);
  };

  const startEdit = (key: ConfigKey) => {
    const config = data?.[key];
    if (config?.data) {
      setEditingKey(key);
      setEditContent(JSON.stringify(config.data, null, 2));
      setSaveError(null);
    }
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditContent('');
    setSaveError(null);
  };

  const saveRawEdit = async () => {
    if (!editingKey) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const parsed = JSON.parse(editContent);
      await saveConfig(editingKey, parsed);
      await fetchData();
      setEditingKey(null);
      setEditContent('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Invalid JSON');
    } finally {
      setIsSaving(false);
    }
  };

  const validateDomain = useCallback((domain: ConfigKey, candidate: unknown): string[] => {
    const parsed = domainSchemas[domain].safeParse(candidate);
    if (parsed.success) return [];
    return parsed.error.issues.map((issue: { path: Array<string | number>; message: string }) => `${issue.path.join('.') || 'root'}: ${issue.message}`);
  }, []);

  const saveForm = async () => {
    setFormSaving(true);
    setFormSaveError(null);
    setFormSaveSuccess(null);

    try {
      if (selectedDomain === 'deploymentState') {
        setFormSaveError('Deployment state form is read-only by design. Use deployment automation to update it.');
        return;
      }

      const errors = validateDomain(selectedDomain, formDraft);
      setFormErrors(errors);
      if (errors.length > 0) {
        setFormSaveError('Validation failed. Fix fields and save again.');
        return;
      }

      await saveConfig(selectedDomain, formDraft);
      await fetchData();
      setFormSaveSuccess('Saved successfully.');
    } catch (err) {
      setFormSaveError(err instanceof Error ? err.message : 'Failed to save form');
    } finally {
      setFormSaving(false);
    }
  };

  const updateDraft = (updater: (next: Record<string, unknown>) => void) => {
    setFormDraft((prev) => {
      const next = deepClone(ensureRecord(prev));
      updater(next);
      return next;
    });
    setFormSaveSuccess(null);
  };

  const currentConfigPath = data?.[selectedDomain]?.path || 'No path';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderProjectLikeEditor = (domain: 'projectConfig' | 'userConfig') => {
    const draft = ensureRecord(formDraft);
    const plugin = Array.isArray(draft.plugin) ? (draft.plugin as string[]) : [];
    const apiKeys = isRecord(draft.apiKeys) ? (draft.apiKeys as Record<string, string>) : {};
    const env = isRecord(draft.env) ? (draft.env as Record<string, string>) : {};

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="$schema">
            <Input
              value={typeof draft.$schema === 'string' ? draft.$schema : ''}
              onChange={(e) => updateDraft((next) => (next.$schema = e.target.value))}
            />
          </Field>
          <Field label="Default model">
            <Input
              value={typeof draft.model === 'string' ? draft.model : ''}
              onChange={(e) => updateDraft((next) => (next.model = e.target.value))}
            />
          </Field>
        </div>

        <Field label="Plugins (one per line)">
          <Textarea
            rows={6}
            value={toLines(plugin)}
            onChange={(e) => updateDraft((next) => (next.plugin = fromLines(e.target.value)))}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API Keys">
            <SecretRecordEditor value={apiKeys} onChange={(nextValue) => updateDraft((next) => (next.apiKeys = nextValue))} />
          </Field>
          <Field label="Environment variables">
            <SecretRecordEditor value={env} onChange={(nextValue) => updateDraft((next) => (next.env = nextValue))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Provider config (JSON)">
            <JsonArea value={draft.provider} onChange={(nextValue) => updateDraft((next) => (next.provider = nextValue))} />
          </Field>
          <Field label="Command config (JSON)">
            <JsonArea value={draft.command} onChange={(nextValue) => updateDraft((next) => (next.command = nextValue))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="MCP config (JSON)">
            <JsonArea value={draft.mcp} onChange={(nextValue) => updateDraft((next) => (next.mcp = nextValue))} />
          </Field>
          <Field label="Permissions (JSON)">
            <JsonArea value={draft.permission} onChange={(nextValue) => updateDraft((next) => (next.permission = nextValue))} />
          </Field>
        </div>

        {domain === 'userConfig' ? (
          <div className="text-xs text-zinc-500">User config supports project overrides; unknown keys are preserved on save.</div>
        ) : null}
      </div>
    );
  };

  const renderOhMyEditor = () => {
    const draft = ensureRecord(formDraft);
    const agents = ensureRecord(draft.agents);
    const enabledAgents = Array.isArray(agents.enabled) ? (agents.enabled as string[]) : [];
    const mcp = ensureRecord(draft.mcp);
    const agentEntries = Object.entries(agents).filter(([k]) => k !== 'enabled');

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="$schema">
            <Input
              value={typeof draft.$schema === 'string' ? draft.$schema : ''}
              onChange={(e) => updateDraft((next) => (next.$schema = e.target.value))}
            />
          </Field>
          <Field label="Google auth enabled">
            <div className="pt-2">
              <Checkbox
                checked={Boolean(draft.google_auth)}
                onChange={(nextValue) => updateDraft((next) => (next.google_auth = nextValue))}
              />
            </div>
          </Field>
        </div>

        <Field label="Enabled agents (one per line)">
          <Textarea
            rows={5}
            value={toLines(enabledAgents)}
            onChange={(e) =>
              updateDraft((next) => {
                const nextAgents = ensureRecord(next.agents);
                nextAgents.enabled = fromLines(e.target.value);
                next.agents = nextAgents;
              })
            }
          />
        </Field>

        <Field label="Agent model mapping">
          <div className="space-y-2">
            {agentEntries.map(([agentName, config]) => {
              const configObj = ensureRecord(config);
              return (
                <div key={agentName} className="grid grid-cols-12 gap-2">
                  <Input value={agentName} disabled className="col-span-4" />
                  <Input
                    value={typeof configObj.model === 'string' ? configObj.model : ''}
                    onChange={(e) =>
                      updateDraft((next) => {
                        const nextAgents = ensureRecord(next.agents);
                        const current = ensureRecord(nextAgents[agentName]);
                        current.model = e.target.value;
                        nextAgents[agentName] = current;
                        next.agents = nextAgents;
                      })
                    }
                    className="col-span-8"
                  />
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="MCP toggles">
          <div className="space-y-2">
            {Object.entries(mcp).map(([name, value]) => {
              const cfg = ensureRecord(value);
              return (
                <div key={name} className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-900 p-2">
                  <span className="text-sm text-zinc-200">{name}</span>
                  <Checkbox
                    checked={Boolean(cfg.enabled)}
                    onChange={(nextValue) =>
                      updateDraft((next) => {
                        const nextMcp = ensureRecord(next.mcp);
                        const current = ensureRecord(nextMcp[name]);
                        current.enabled = nextValue;
                        nextMcp[name] = current;
                        next.mcp = nextMcp;
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="Hooks (JSON)">
          <JsonArea value={draft.hooks} onChange={(nextValue) => updateDraft((next) => (next.hooks = nextValue))} />
        </Field>
      </div>
    );
  };

  const renderCompoundEditor = () => {
    const draft = ensureRecord(formDraft);
    const skills = ensureRecord(draft.skills);
    const categories = ensureRecord(skills.categories);
    const commands = ensureRecord(draft.commands);
    const integration = ensureRecord(draft.integration);
    const plugin = ensureRecord(integration.plugin);
    const usage = ensureRecord(draft.usage);
    const example = ensureRecord(usage.example);

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={typeof draft.name === 'string' ? draft.name : ''} onChange={(e) => updateDraft((next) => (next.name = e.target.value))} />
          </Field>
          <Field label="Version">
            <Input value={typeof draft.version === 'string' ? draft.version : ''} onChange={(e) => updateDraft((next) => (next.version = e.target.value))} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea rows={3} value={typeof draft.description === 'string' ? draft.description : ''} onChange={(e) => updateDraft((next) => (next.description = e.target.value))} />
        </Field>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Source">
            <Input value={typeof draft.source === 'string' ? draft.source : ''} onChange={(e) => updateDraft((next) => (next.source = e.target.value))} />
          </Field>
          <Field label="Scope">
            <Input value={typeof draft.scope === 'string' ? draft.scope : ''} onChange={(e) => updateDraft((next) => (next.scope = e.target.value))} />
          </Field>
          <Field label="Available">
            <div className="pt-2">
              <Checkbox checked={Boolean(draft.available)} onChange={(nextValue) => updateDraft((next) => (next.available = nextValue))} />
            </div>
          </Field>
        </div>

        <Field label="Enabled skills (one per line)">
          <Textarea
            rows={8}
            value={toLines(Array.isArray(skills.enabled) ? (skills.enabled as string[]) : [])}
            onChange={(e) =>
              updateDraft((next) => {
                const nextSkills = ensureRecord(next.skills);
                nextSkills.enabled = fromLines(e.target.value);
                next.skills = nextSkills;
              })
            }
          />
        </Field>

        <Field label="Skill categories (JSON)">
          <JsonArea
            value={categories}
            onChange={(nextValue) =>
              updateDraft((next) => {
                const nextSkills = ensureRecord(next.skills);
                nextSkills.categories = nextValue;
                next.skills = nextSkills;
              })
            }
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Command count">
            <Input
              type="number"
              value={String(typeof commands.count === 'number' ? commands.count : 0)}
              onChange={(e) =>
                updateDraft((next) => {
                  const nextCommands = ensureRecord(next.commands);
                  nextCommands.count = parseNumber(e.target.value);
                  next.commands = nextCommands;
                })
              }
            />
          </Field>
          <Field label="Command categories (JSON)">
            <JsonArea
              value={commands.categories}
              onChange={(nextValue) =>
                updateDraft((next) => {
                  const nextCommands = ensureRecord(next.commands);
                  nextCommands.categories = nextValue;
                  next.commands = nextCommands;
                })
              }
            />
          </Field>
        </div>

        <Field label="Integration plugin">
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              placeholder="name"
              value={typeof plugin.name === 'string' ? plugin.name : ''}
              onChange={(e) =>
                updateDraft((next) => {
                  const nextIntegration = ensureRecord(next.integration);
                  const nextPlugin = ensureRecord(nextIntegration.plugin);
                  nextPlugin.name = e.target.value;
                  nextIntegration.plugin = nextPlugin;
                  next.integration = nextIntegration;
                })
              }
            />
            <Input
              placeholder="path"
              value={typeof plugin.path === 'string' ? plugin.path : ''}
              onChange={(e) =>
                updateDraft((next) => {
                  const nextIntegration = ensureRecord(next.integration);
                  const nextPlugin = ensureRecord(nextIntegration.plugin);
                  nextPlugin.path = e.target.value;
                  nextIntegration.plugin = nextPlugin;
                  next.integration = nextIntegration;
                })
              }
            />
          </div>
        </Field>

        <Field label="Usage example">
          <JsonArea
            value={{ slash_command: usage.slash_command, task_loading: usage.task_loading, example }}
            onChange={(nextValue) =>
              updateDraft((next) => {
                const nextUsage = ensureRecord(next.usage);
                const v = ensureRecord(nextValue);
                nextUsage.slash_command = v.slash_command;
                nextUsage.task_loading = v.task_loading;
                nextUsage.example = v.example;
                next.usage = nextUsage;
              })
            }
          />
        </Field>
      </div>
    );
  };

  const renderRateLimitEditor = () => {
    const draft = ensureRecord(formDraft);
    const fallbackModels = Array.isArray(draft.fallbackModels)
      ? (draft.fallbackModels as Array<Record<string, unknown>>)
      : [];
    const retryPolicy = ensureRecord(draft.retryPolicy);
    const circuitBreaker = ensureRecord(draft.circuitBreaker);

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Enabled">
            <div className="pt-2">
              <Checkbox checked={Boolean(draft.enabled)} onChange={(nextValue) => updateDraft((next) => (next.enabled = nextValue))} />
            </div>
          </Field>
          <Field label="Fallback mode">
            <select
              value={typeof draft.fallbackMode === 'string' ? draft.fallbackMode : 'cycle'}
              onChange={(e) => updateDraft((next) => (next.fallbackMode = e.target.value))}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="cycle">cycle</option>
              <option value="ordered">ordered</option>
              <option value="random">random</option>
            </select>
          </Field>
          <Field label="Cooldown (ms)">
            <Input type="number" value={String(typeof draft.cooldownMs === 'number' ? draft.cooldownMs : 0)} onChange={(e) => updateDraft((next) => (next.cooldownMs = parseNumber(e.target.value)))} />
          </Field>
        </div>

        <Field label="Fallback models">
          <div className="space-y-2">
            {fallbackModels.map((entry, idx) => (
              <div key={`${idx}-${String(entry.modelID || '')}`} className="grid grid-cols-12 gap-2">
                <Input
                  className="col-span-4"
                  value={typeof entry.providerID === 'string' ? entry.providerID : ''}
                  onChange={(e) =>
                    updateDraft((next) => {
                      const list = Array.isArray(next.fallbackModels) ? [...(next.fallbackModels as Array<Record<string, unknown>>)] : [];
                      list[idx] = { ...list[idx], providerID: e.target.value };
                      next.fallbackModels = list;
                    })
                  }
                />
                <Input
                  className="col-span-7"
                  value={typeof entry.modelID === 'string' ? entry.modelID : ''}
                  onChange={(e) =>
                    updateDraft((next) => {
                      const list = Array.isArray(next.fallbackModels) ? [...(next.fallbackModels as Array<Record<string, unknown>>)] : [];
                      list[idx] = { ...list[idx], modelID: e.target.value };
                      next.fallbackModels = list;
                    })
                  }
                />
                <button
                  type="button"
                  className="col-span-1 rounded bg-red-700/70 text-xs text-red-100 hover:bg-red-600/70"
                  onClick={() =>
                    updateDraft((next) => {
                      const list = Array.isArray(next.fallbackModels) ? [...(next.fallbackModels as Array<Record<string, unknown>>)] : [];
                      next.fallbackModels = list.filter((_, i) => i !== idx);
                    })
                  }
                >
                  X
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateDraft((next) => {
                  const list = Array.isArray(next.fallbackModels) ? [...(next.fallbackModels as Array<Record<string, unknown>>)] : [];
                  list.push({ providerID: 'anthropic', modelID: '' });
                  next.fallbackModels = list;
                })
              }
              className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
            >
              Add fallback model
            </button>
          </div>
        </Field>

        <Field label="Retry policy">
          <div className="grid gap-2 md:grid-cols-4">
            <Input type="number" placeholder="maxRetries" value={String(typeof retryPolicy.maxRetries === 'number' ? retryPolicy.maxRetries : 0)} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.maxRetries = parseNumber(e.target.value); next.retryPolicy = rp; })} />
            <Input placeholder="strategy" value={typeof retryPolicy.strategy === 'string' ? retryPolicy.strategy : ''} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.strategy = e.target.value; next.retryPolicy = rp; })} />
            <Input type="number" placeholder="baseDelayMs" value={String(typeof retryPolicy.baseDelayMs === 'number' ? retryPolicy.baseDelayMs : 0)} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.baseDelayMs = parseNumber(e.target.value); next.retryPolicy = rp; })} />
            <Input type="number" placeholder="maxDelayMs" value={String(typeof retryPolicy.maxDelayMs === 'number' ? retryPolicy.maxDelayMs : 0)} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.maxDelayMs = parseNumber(e.target.value); next.retryPolicy = rp; })} />
            <Input type="number" placeholder="jitterFactor" value={String(typeof retryPolicy.jitterFactor === 'number' ? retryPolicy.jitterFactor : 0)} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.jitterFactor = parseNumber(e.target.value); next.retryPolicy = rp; })} />
            <Input type="number" placeholder="timeoutMs" value={String(typeof retryPolicy.timeoutMs === 'number' ? retryPolicy.timeoutMs : 0)} onChange={(e) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.timeoutMs = parseNumber(e.target.value); next.retryPolicy = rp; })} />
            <label className="flex items-center gap-2 text-xs text-zinc-300"><Checkbox checked={Boolean(retryPolicy.jitterEnabled)} onChange={(nextValue) => updateDraft((next) => { const rp = ensureRecord(next.retryPolicy); rp.jitterEnabled = nextValue; next.retryPolicy = rp; })} /> jitterEnabled</label>
          </div>
        </Field>

        <Field label="Circuit breaker">
          <div className="grid gap-2 md:grid-cols-4">
            <label className="flex items-center gap-2 text-xs text-zinc-300"><Checkbox checked={Boolean(circuitBreaker.enabled)} onChange={(nextValue) => updateDraft((next) => { const cb = ensureRecord(next.circuitBreaker); cb.enabled = nextValue; next.circuitBreaker = cb; })} /> enabled</label>
            <Input type="number" placeholder="failureThreshold" value={String(typeof circuitBreaker.failureThreshold === 'number' ? circuitBreaker.failureThreshold : 0)} onChange={(e) => updateDraft((next) => { const cb = ensureRecord(next.circuitBreaker); cb.failureThreshold = parseNumber(e.target.value); next.circuitBreaker = cb; })} />
            <Input type="number" placeholder="recoveryTimeoutMs" value={String(typeof circuitBreaker.recoveryTimeoutMs === 'number' ? circuitBreaker.recoveryTimeoutMs : 0)} onChange={(e) => updateDraft((next) => { const cb = ensureRecord(next.circuitBreaker); cb.recoveryTimeoutMs = parseNumber(e.target.value); next.circuitBreaker = cb; })} />
            <Input type="number" placeholder="halfOpenMaxCalls" value={String(typeof circuitBreaker.halfOpenMaxCalls === 'number' ? circuitBreaker.halfOpenMaxCalls : 0)} onChange={(e) => updateDraft((next) => { const cb = ensureRecord(next.circuitBreaker); cb.halfOpenMaxCalls = parseNumber(e.target.value); next.circuitBreaker = cb; })} />
            <Input type="number" placeholder="successThreshold" value={String(typeof circuitBreaker.successThreshold === 'number' ? circuitBreaker.successThreshold : 0)} onChange={(e) => updateDraft((next) => { const cb = ensureRecord(next.circuitBreaker); cb.successThreshold = parseNumber(e.target.value); next.circuitBreaker = cb; })} />
          </div>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Enable subagent fallback">
            <div className="pt-2">
              <Checkbox checked={Boolean(draft.enableSubagentFallback)} onChange={(nextValue) => updateDraft((next) => (next.enableSubagentFallback = nextValue))} />
            </div>
          </Field>
          <Field label="Max subagent depth">
            <Input type="number" value={String(typeof draft.maxSubagentDepth === 'number' ? draft.maxSubagentDepth : 0)} onChange={(e) => updateDraft((next) => (next.maxSubagentDepth = parseNumber(e.target.value)))} />
          </Field>
        </div>
      </div>
    );
  };

  const renderModelPoliciesEditor = () => {
    const draft = ensureRecord(formDraft);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Version">
            <Input value={typeof draft.version === 'string' ? draft.version : ''} onChange={(e) => updateDraft((next) => (next.version = e.target.value))} />
          </Field>
          <Field label="Description">
            <Input value={typeof draft.description === 'string' ? draft.description : ''} onChange={(e) => updateDraft((next) => (next.description = e.target.value))} />
          </Field>
        </div>

        <div className="rounded border border-zinc-700 bg-zinc-900/60 p-3 text-xs text-zinc-400">
          Hybrid editor: use typed top-level fields plus JSON blocks for deeply nested routing policy structures.
        </div>

        <Field label="Intent routing (JSON)">
          <JsonArea value={draft.intentRouting} onChange={(nextValue) => updateDraft((next) => (next.intentRouting = nextValue))} />
        </Field>
        <Field label="Models registry (JSON)">
          <JsonArea value={draft.models} onChange={(nextValue) => updateDraft((next) => (next.models = nextValue))} />
        </Field>
        <Field label="Cost tiers (JSON)">
          <JsonArea value={draft.cost_tiers} onChange={(nextValue) => updateDraft((next) => (next.cost_tiers = nextValue))} />
        </Field>
        <Field label="Complexity routing (JSON)">
          <JsonArea value={draft.complexity_routing} onChange={(nextValue) => updateDraft((next) => (next.complexity_routing = nextValue))} />
        </Field>
        <Field label="Tuning (JSON)">
          <JsonArea value={draft.tuning} onChange={(nextValue) => updateDraft((next) => (next.tuning = nextValue))} />
        </Field>
      </div>
    );
  };

  const renderAntigravityEditor = () => {
    const draft = ensureRecord(formDraft);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="$schema">
            <Input value={typeof draft.$schema === 'string' ? draft.$schema : ''} onChange={(e) => updateDraft((next) => (next.$schema = e.target.value))} />
          </Field>
          <Field label="Toast scope">
            <Input value={typeof draft.toast_scope === 'string' ? draft.toast_scope : ''} onChange={(e) => updateDraft((next) => (next.toast_scope = e.target.value))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Account strategy">
            <Input value={typeof draft.account_selection_strategy === 'string' ? draft.account_selection_strategy : ''} onChange={(e) => updateDraft((next) => (next.account_selection_strategy = e.target.value))} />
          </Field>
          <Field label="Scheduling mode">
            <Input value={typeof draft.scheduling_mode === 'string' ? draft.scheduling_mode : ''} onChange={(e) => updateDraft((next) => (next.scheduling_mode = e.target.value))} />
          </Field>
          <Field label="Soft quota threshold %">
            <Input type="number" value={String(typeof draft.soft_quota_threshold_percent === 'number' ? draft.soft_quota_threshold_percent : 0)} onChange={(e) => updateDraft((next) => (next.soft_quota_threshold_percent = parseNumber(e.target.value)))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Max cache-first wait (sec)">
            <Input type="number" value={String(typeof draft.max_cache_first_wait_seconds === 'number' ? draft.max_cache_first_wait_seconds : 0)} onChange={(e) => updateDraft((next) => (next.max_cache_first_wait_seconds = parseNumber(e.target.value)))} />
          </Field>
          <Field label="Quota refresh interval (min)">
            <Input type="number" value={String(typeof draft.quota_refresh_interval_minutes === 'number' ? draft.quota_refresh_interval_minutes : 0)} onChange={(e) => updateDraft((next) => (next.quota_refresh_interval_minutes = parseNumber(e.target.value)))} />
          </Field>
          <Field label="Max rate-limit wait (sec)">
            <Input type="number" value={String(typeof draft.max_rate_limit_wait_seconds === 'number' ? draft.max_rate_limit_wait_seconds : 0)} onChange={(e) => updateDraft((next) => (next.max_rate_limit_wait_seconds = parseNumber(e.target.value)))} />
          </Field>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {[
            'quota_fallback',
            'cli_first',
            'switch_on_first_rate_limit',
            'session_recovery',
            'auto_resume',
            'proactive_token_refresh',
            'debug',
            'quiet_mode',
            'auto_update',
          ].map((k) => (
            <label key={k} className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-300">
              <Checkbox checked={Boolean(draft[k])} onChange={(nextValue) => updateDraft((next) => (next[k] = nextValue))} />
              {k}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderSupermemoryEditor = () => {
    const draft = ensureRecord(formDraft);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="$schema">
            <Input value={typeof draft.$schema === 'string' ? draft.$schema : ''} onChange={(e) => updateDraft((next) => (next.$schema = e.target.value))} />
          </Field>
          <Field label="API key placeholder">
            <Input type="password" value={typeof draft.apiKey === 'string' ? draft.apiKey : ''} onChange={(e) => updateDraft((next) => (next.apiKey = e.target.value))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Similarity threshold">
            <Input type="number" step="0.01" value={String(typeof draft.similarityThreshold === 'number' ? draft.similarityThreshold : 0)} onChange={(e) => updateDraft((next) => (next.similarityThreshold = parseNumber(e.target.value)))} />
          </Field>
          <Field label="Compaction threshold">
            <Input type="number" step="0.01" value={String(typeof draft.compactionThreshold === 'number' ? draft.compactionThreshold : 0)} onChange={(e) => updateDraft((next) => (next.compactionThreshold = parseNumber(e.target.value)))} />
          </Field>
          <Field label="Max memories">
            <Input type="number" value={String(typeof draft.maxMemories === 'number' ? draft.maxMemories : 0)} onChange={(e) => updateDraft((next) => (next.maxMemories = parseNumber(e.target.value)))} />
          </Field>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {['autoIndex', 'contextInjection', 'injectProfile'].map((k) => (
            <label key={k} className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-300">
              <Checkbox checked={Boolean(draft[k])} onChange={(nextValue) => updateDraft((next) => (next[k] = nextValue))} />
              {k}
            </label>
          ))}
        </div>

        <Field label="Keyword patterns (one per line)">
          <Textarea
            rows={8}
            value={toLines(Array.isArray(draft.keywordPatterns) ? (draft.keywordPatterns as string[]) : [])}
            onChange={(e) => updateDraft((next) => (next.keywordPatterns = fromLines(e.target.value)))}
          />
        </Field>
      </div>
    );
  };

  const renderDeploymentStateEditor = () => {
    const draft = ensureRecord(formDraft);
    const environments = ensureRecord(draft.environments);
    const history = Array.isArray(draft.history) ? (draft.history as Array<Record<string, unknown>>) : [];

    return (
      <div className="space-y-4">
        <div className="rounded border border-zinc-700 bg-zinc-900/70 p-3 text-xs text-zinc-400">
          Deployment state is read-only in the typed editor.
        </div>

        <Field label="Version">
          <Input value={String(typeof draft.version === 'number' ? draft.version : '')} disabled />
        </Field>

        <div className="overflow-x-auto rounded border border-zinc-700">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="bg-zinc-900 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2">Environment</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">SHA</th>
                <th className="px-3 py-2">Updated At</th>
                <th className="px-3 py-2">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(environments).map(([name, value]) => {
                const env = ensureRecord(value);
                return (
                  <tr key={name} className="border-t border-zinc-800">
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2">{String(env.version ?? '')}</td>
                    <td className="px-3 py-2">{String(env.sha ?? '')}</td>
                    <td className="px-3 py-2">{String(env.updated_at ?? '')}</td>
                    <td className="px-3 py-2">{String(env.updated_by ?? '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Field label="History table (JSON rows)">
          <div className="max-h-64 overflow-auto rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-300">
            {history.length === 0 ? (
              <div className="text-zinc-500">No deployment history entries.</div>
            ) : (
              history.map((entry, idx) => <pre key={idx}>{JSON.stringify(entry, null, 2)}</pre>)
            )}
          </div>
        </Field>
      </div>
    );
  };

  const renderLearningPolicyEditor = () => {
    const draft = ensureRecord(formDraft);
    const requiredValidationFields = Array.isArray(draft.required_validation_fields)
      ? (draft.required_validation_fields as string[])
      : [];
    const passForRisk = ensureRecord(draft.require_pass_for_risk);

    return (
      <div className="space-y-4">
        <Field label="Policy version">
          <Input type="number" value={String(typeof draft.version === 'number' ? draft.version : 1)} onChange={(e) => updateDraft((next) => (next.version = parseNumber(e.target.value, 1)))} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Governed paths (one per line)">
            <Textarea rows={8} value={toLines(Array.isArray(draft.governed_paths) ? (draft.governed_paths as string[]) : [])} onChange={(e) => updateDraft((next) => (next.governed_paths = fromLines(e.target.value)))} />
          </Field>
          <Field label="Required update fields (one per line)">
            <Textarea rows={8} value={toLines(Array.isArray(draft.required_update_fields) ? (draft.required_update_fields as string[]) : [])} onChange={(e) => updateDraft((next) => (next.required_update_fields = fromLines(e.target.value)))} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Required validation fields">
            <Textarea rows={6} value={toLines(requiredValidationFields)} onChange={(e) => updateDraft((next) => (next.required_validation_fields = fromLines(e.target.value)))} />
          </Field>
          <Field label="Allowed validation status">
            <Textarea rows={6} value={toLines(Array.isArray(draft.allowed_validation_status) ? (draft.allowed_validation_status as string[]) : [])} onChange={(e) => updateDraft((next) => (next.allowed_validation_status = fromLines(e.target.value)))} />
          </Field>
          <Field label="Allowed risk levels">
            <Textarea rows={6} value={toLines(Array.isArray(draft.allowed_risk_levels) ? (draft.allowed_risk_levels as string[]) : [])} onChange={(e) => updateDraft((next) => (next.allowed_risk_levels = fromLines(e.target.value)))} />
          </Field>
        </div>

        <Field label="Require-pass matrix">
          <div className="space-y-3">
            {['low', 'medium', 'high'].map((risk) => {
              const active = Array.isArray(passForRisk[risk]) ? (passForRisk[risk] as string[]) : [];
              return (
                <div key={risk} className="rounded border border-zinc-700 bg-zinc-900 p-3">
                  <div className="mb-2 text-xs uppercase text-zinc-400">{risk}</div>
                  <div className="flex flex-wrap gap-3">
                    {requiredValidationFields.map((field) => {
                      const checked = active.includes(field);
                      return (
                        <label key={field} className="flex items-center gap-2 text-xs text-zinc-300">
                          <Checkbox
                            checked={checked}
                            onChange={(nextValue) =>
                              updateDraft((next) => {
                                const matrix = ensureRecord(next.require_pass_for_risk);
                                const list = Array.isArray(matrix[risk]) ? [...(matrix[risk] as string[])] : [];
                                matrix[risk] = nextValue ? Array.from(new Set([...list, field])) : list.filter((x) => x !== field);
                                next.require_pass_for_risk = matrix;
                              })
                            }
                          />
                          {field}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Field>
      </div>
    );
  };

  const renderSessionBudgetsEditor = () => {
    const draft = ensureRecord(formDraft);
    const sessions = ensureRecord(draft.sessions);

    return (
      <div className="space-y-4">
        <Field label="Saved at">
          <Input
            value={typeof draft.savedAt === 'string' ? draft.savedAt : ''}
            onChange={(e) => updateDraft((next) => (next.savedAt = e.target.value))}
          />
        </Field>

        <Field label="Session budget table">
          <div className="space-y-3">
            {Object.entries(sessions).map(([sessionId, modelMap]) => {
              const models = ensureRecord(modelMap);
              return (
                <div key={sessionId} className="rounded border border-zinc-700 bg-zinc-900 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      value={sessionId}
                      onChange={(e) => {
                        const nextId = e.target.value.trim();
                        updateDraft((next) => {
                          const nextSessions = ensureRecord(next.sessions);
                          const payload = nextSessions[sessionId];
                          delete nextSessions[sessionId];
                          if (nextId) nextSessions[nextId] = payload;
                          next.sessions = nextSessions;
                        });
                      }}
                      className="max-w-md"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft((next) => {
                          const nextSessions = ensureRecord(next.sessions);
                          delete nextSessions[sessionId];
                          next.sessions = nextSessions;
                        })
                      }
                      className="rounded bg-red-700/70 px-2 py-1 text-xs text-red-100 hover:bg-red-600/70"
                    >
                      Remove session
                    </button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(models).map(([modelId, amount]) => (
                      <div key={modelId} className="grid grid-cols-12 gap-2">
                        <Input
                          className="col-span-8"
                          value={modelId}
                          onChange={(e) => {
                            const nextId = e.target.value.trim();
                            updateDraft((next) => {
                              const nextSessions = ensureRecord(next.sessions);
                              const nextModels = ensureRecord(nextSessions[sessionId]);
                              const currentAmount = nextModels[modelId];
                              delete nextModels[modelId];
                              if (nextId) nextModels[nextId] = currentAmount;
                              nextSessions[sessionId] = nextModels;
                              next.sessions = nextSessions;
                            });
                          }}
                        />
                        <Input
                          className="col-span-3"
                          type="number"
                          value={String(typeof amount === 'number' ? amount : 0)}
                          onChange={(e) =>
                            updateDraft((next) => {
                              const nextSessions = ensureRecord(next.sessions);
                              const nextModels = ensureRecord(nextSessions[sessionId]);
                              nextModels[modelId] = parseNumber(e.target.value);
                              nextSessions[sessionId] = nextModels;
                              next.sessions = nextSessions;
                            })
                          }
                        />
                        <button
                          type="button"
                          className="col-span-1 rounded bg-red-700/70 text-xs text-red-100 hover:bg-red-600/70"
                          onClick={() =>
                            updateDraft((next) => {
                              const nextSessions = ensureRecord(next.sessions);
                              const nextModels = ensureRecord(nextSessions[sessionId]);
                              delete nextModels[modelId];
                              nextSessions[sessionId] = nextModels;
                              next.sessions = nextSessions;
                            })
                          }
                        >
                          X
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft((next) => {
                          const nextSessions = ensureRecord(next.sessions);
                          const nextModels = ensureRecord(nextSessions[sessionId]);
                          nextModels['provider/model'] = 0;
                          nextSessions[sessionId] = nextModels;
                          next.sessions = nextSessions;
                        })
                      }
                      className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
                    >
                      Add model budget
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                updateDraft((next) => {
                  const nextSessions = ensureRecord(next.sessions);
                  nextSessions[`session_${Date.now()}`] = { 'provider/model': 0 };
                  next.sessions = nextSessions;
                })
              }
              className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
            >
              Add session
            </button>
          </div>
        </Field>
      </div>
    );
  };

  const renderDomainForm = () => {
    switch (selectedDomain) {
      case 'projectConfig':
        return renderProjectLikeEditor('projectConfig');
      case 'userConfig':
        return renderProjectLikeEditor('userConfig');
      case 'ohMyConfig':
        return renderOhMyEditor();
      case 'compoundConfig':
        return renderCompoundEditor();
      case 'rateLimitFallback':
        return renderRateLimitEditor();
      case 'modelPolicies':
        return renderModelPoliciesEditor();
      case 'antigravity':
        return renderAntigravityEditor();
      case 'supermemory':
        return renderSupermemoryEditor();
      case 'deploymentState':
        return renderDeploymentStateEditor();
      case 'learningUpdatePolicy':
        return renderLearningPolicyEditor();
      case 'sessionBudgets':
        return renderSessionBudgetsEditor();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4">
        <p className="text-red-400">Error loading config: {error}</p>
        <button onClick={fetchData} className="mt-2 rounded bg-red-600 px-3 py-1 text-sm text-red-50">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search config keys..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-1">
          <button
            onClick={() => setMode('raw')}
            className={`rounded px-3 py-1 text-sm ${mode === 'raw' ? 'bg-emerald-600 text-emerald-50' : 'text-zinc-300 hover:bg-zinc-800'}`}
          >
            Raw
          </button>
          <button
            onClick={() => setMode('form')}
            className={`rounded px-3 py-1 text-sm ${mode === 'form' ? 'bg-emerald-600 text-emerald-50' : 'text-zinc-300 hover:bg-zinc-800'}`}
          >
            Form
          </button>
        </div>
        <button onClick={fetchData} className="rounded-lg bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600">
          Refresh
        </button>
      </div>

      {mode === 'raw' ? (
        <div className="space-y-3">
          {sections.map(({ key, name, icon, description }) => {
            const config = data[key];
            const isExpanded = expandedSections.has(key);
            const isEditing = editingKey === key;
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50">
                <button
                  onClick={() => toggleSection(key)}
                  className="flex w-full items-center justify-between border-b border-zinc-700 px-4 py-3 hover:bg-zinc-800/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{icon}</span>
                    <div className="text-left">
                      <div className="font-medium text-zinc-100">{name}</div>
                      <div className="text-xs text-zinc-500">{description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {config?.data && !isEditing ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(key);
                          }}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-emerald-50 hover:bg-emerald-500"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(JSON.stringify(config.data, null, 2));
                          }}
                          className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
                        >
                          Copy
                        </button>
                      </>
                    ) : null}
                    <span className="text-zinc-400">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="p-4">
                    <div className="mb-2 font-mono text-xs text-zinc-500">{config?.path || 'No path'}</div>
                    {isEditing ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={18}
                          className="font-mono text-sm"
                          spellCheck={false}
                        />
                        {saveError ? <div className="text-sm text-red-500">{saveError}</div> : null}
                        <div className="flex gap-2">
                          <button
                            onClick={saveRawEdit}
                            disabled={isSaving}
                            className="rounded bg-emerald-600 px-4 py-2 text-emerald-50 hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isSaving}
                            className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : config?.data ? (
                      <div className="max-h-[520px] overflow-auto rounded border border-zinc-700 bg-zinc-950 p-4">
                        <JsonTree data={config.data} searchTerm={searchTerm} />
                      </div>
                    ) : (
                      <div className="rounded bg-zinc-900 p-4 italic text-zinc-500">File not found or invalid JSON</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,300px),1fr] md:items-center">
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value as ConfigKey)}
              className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              {sections.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.icon} {section.name}
                </option>
              ))}
            </select>
            <div>
              <div className="text-sm font-medium text-zinc-100">{activeSection?.name}</div>
              <div className="text-xs text-zinc-500">{activeSection?.description}</div>
              <div className="mt-1 font-mono text-xs text-zinc-500">{currentConfigPath}</div>
            </div>
          </div>

          {formErrors.length > 0 ? (
            <div className="mb-3 rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-400">
              {formErrors.map((issue: string) => (
                <div key={issue}>{issue}</div>
              ))}
            </div>
          ) : null}

          {renderDomainForm()}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={saveForm}
              disabled={formSaving || selectedDomain === 'deploymentState'}
              className="rounded bg-emerald-600 px-4 py-2 text-emerald-50 hover:bg-emerald-500 disabled:opacity-50"
            >
              {formSaving ? 'Saving...' : 'Save Form'}
            </button>
            <button
              onClick={() => hydrateFormDraft(data, selectedDomain)}
              disabled={formSaving}
              className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={() => copyToClipboard(JSON.stringify(formDraft, null, 2))}
              className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600"
            >
              Copy JSON
            </button>
            {formSaveError ? <span className="text-sm text-red-500">{formSaveError}</span> : null}
            {formSaveSuccess ? <span className="text-sm text-emerald-400">{formSaveSuccess}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
