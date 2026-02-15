'use client';

import { useEffect, useMemo, useState } from 'react';

const INTENTS = [
  'simple_read',
  'format_transformation',
  'documentation',
  'code_generation',
  'code_transformation',
  'debugging',
  'architecture',
  'large_context',
  'multimodal',
  'orchestration',
] as const;

const LAYERS = ['layer_1', 'layer_2', 'layer_3', 'layer_4', 'layer_5', 'layer_6'] as const;

type IntentName = (typeof INTENTS)[number];
type LayerName = (typeof LAYERS)[number];
type RoutingMatrix = Record<IntentName, Record<LayerName, string[]>>;
type RoutingKey = 'intent_routing' | 'intentRouting';

type ModelMap = Record<string, { provider?: string; name?: string }>;

interface PoliciesPayload {
  models?: ModelMap;
  intent_routing?: unknown;
  intentRouting?: unknown;
  [key: string]: unknown;
}

interface ApiModelsResponse {
  policies?: PoliciesPayload;
  routerState?: unknown;
  rlState?: unknown;
  fallbackConfig?: unknown;
}

interface MatrixCellRef {
  intent: IntentName;
  layer: LayerName;
}

function createEmptyMatrix(): RoutingMatrix {
  const matrix = {} as RoutingMatrix;
  for (const intent of INTENTS) {
    matrix[intent] = {} as Record<LayerName, string[]>;
    for (const layer of LAYERS) {
      matrix[intent][layer] = [];
    }
  }
  return matrix;
}

function getLayerColor(layer: LayerName) {
  const palette: Record<LayerName, { bg: string; border: string; text: string }> = {
    layer_1: { bg: 'bg-emerald-900/30', border: 'border-emerald-500/40', text: 'text-emerald-300' },
    layer_2: { bg: 'bg-green-900/30', border: 'border-green-500/40', text: 'text-green-300' },
    layer_3: { bg: 'bg-yellow-900/30', border: 'border-yellow-500/40', text: 'text-yellow-300' },
    layer_4: { bg: 'bg-orange-900/30', border: 'border-orange-500/40', text: 'text-orange-300' },
    layer_5: { bg: 'bg-red-900/30', border: 'border-red-500/40', text: 'text-red-300' },
    layer_6: { bg: 'bg-fuchsia-900/30', border: 'border-fuchsia-500/40', text: 'text-fuchsia-300' },
  };
  return palette[layer];
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function detectRoutingKey(policies: PoliciesPayload | undefined): RoutingKey {
  if (policies && Object.prototype.hasOwnProperty.call(policies, 'intent_routing')) return 'intent_routing';
  if (policies && Object.prototype.hasOwnProperty.call(policies, 'intentRouting')) return 'intentRouting';
  return 'intentRouting';
}

function normalizeMatrix(rawRouting: unknown, validModelIds: Set<string>): RoutingMatrix {
  const matrix = createEmptyMatrix();
  if (!rawRouting || typeof rawRouting !== 'object') {
    return matrix;
  }

  const routing = rawRouting as Record<string, unknown>;

  for (const intent of INTENTS) {
    const intentConfig = routing[intent];
    if (!intentConfig || typeof intentConfig !== 'object') continue;

    for (const layer of LAYERS) {
      const value = (intentConfig as Record<string, unknown>)[layer];
      const modelList = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : typeof value === 'string'
          ? [value]
          : [];

      matrix[intent][layer] = uniqueOrdered(modelList.filter((modelId) => validModelIds.has(modelId)));
    }
  }

  return matrix;
}

function matrixToPayload(matrix: RoutingMatrix): Record<IntentName, Record<LayerName, string[]>> {
  const payload = {} as Record<IntentName, Record<LayerName, string[]>>;
  for (const intent of INTENTS) {
    payload[intent] = {} as Record<LayerName, string[]>;
    for (const layer of LAYERS) {
      payload[intent][layer] = [...matrix[intent][layer]];
    }
  }
  return payload;
}

function humanIntent(intent: IntentName): string {
  return intent.replace(/_/g, ' ');
}

function layerLabel(layer: LayerName): string {
  return `L${layer.replace('layer_', '')}`;
}

export default function ModelsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [policies, setPolicies] = useState<PoliciesPayload | null>(null);
  const [routingKey, setRoutingKey] = useState<RoutingKey>('intentRouting');
  const [matrix, setMatrix] = useState<RoutingMatrix>(createEmptyMatrix);

  const [editingCell, setEditingCell] = useState<MatrixCellRef | null>(null);

  const modelMap = (policies?.models || {}) as ModelMap;
  const modelIds = useMemo(() => Object.keys(modelMap), [modelMap]);

  const sortedModels = useMemo(() => {
    return Object.entries(modelMap)
      .map(([id, model]) => ({ id, provider: model.provider || 'unknown', name: model.name || id }))
      .sort((a, b) => {
        const providerCompare = a.provider.localeCompare(b.provider);
        if (providerCompare !== 0) return providerCompare;
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return a.id.localeCompare(b.id);
      });
  }, [modelMap]);

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch('/api/models', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch /api/models');
      }

      const payload = (await response.json()) as ApiModelsResponse;
      const nextPolicies = payload.policies || {};
      const nextModelIds = new Set(Object.keys((nextPolicies.models || {}) as ModelMap));
      const nextRoutingKey = detectRoutingKey(nextPolicies);
      const rawRouting = nextRoutingKey === 'intent_routing' ? nextPolicies.intent_routing : nextPolicies.intentRouting;

      setPolicies(nextPolicies);
      setRoutingKey(nextRoutingKey);
      setMatrix(normalizeMatrix(rawRouting, nextModelIds));
      setError(null);
    } catch (loadError) {
      setPolicies({});
      setMatrix(createEmptyMatrix());
      setError(loadError instanceof Error ? loadError.message : 'Unable to load model routing');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData(true);
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const validateMatrix = (candidate: RoutingMatrix): RoutingMatrix => {
    const validIntents = new Set<string>(INTENTS);
    const validLayers = new Set<string>(LAYERS);
    const validModels = new Set<string>(modelIds);
    const next = createEmptyMatrix();

    for (const intent of INTENTS) {
      if (!validIntents.has(intent)) continue;
      for (const layer of LAYERS) {
        if (!validLayers.has(layer)) continue;
        const values = candidate[intent]?.[layer] || [];
        next[intent][layer] = uniqueOrdered(values.filter((modelId) => validModels.has(modelId)));
      }
    }

    return next;
  };

  const saveMatrixCell = async (cell: MatrixCellRef, selectedModels: string[]) => {
    if (!policies) return;

    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);

    const nextMatrix: RoutingMatrix = {
      ...matrix,
      [cell.intent]: {
        ...matrix[cell.intent],
        [cell.layer]: selectedModels,
      },
    };

    const validatedMatrix = validateMatrix(nextMatrix);
    const nextPolicies: PoliciesPayload = JSON.parse(JSON.stringify(policies));
    nextPolicies[routingKey] = matrixToPayload(validatedMatrix);

    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policies: nextPolicies }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to persist routing matrix');
      }

      setPolicies(nextPolicies);
      setMatrix(validatedMatrix);
      setSaveMessage(`Saved ${humanIntent(cell.intent)} / ${layerLabel(cell.layer)}`);
      setEditingCell(null);
    } catch (persistError) {
      setSaveError(persistError instanceof Error ? persistError.message : 'Failed to persist routing matrix');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Model Intent Routing Matrix</h1>
          <p className="text-sm text-zinc-400 mt-1">
            10 intents x 6 layers from <span className="text-zinc-200">/api/models</span>
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {saveMessage && <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{saveMessage}</div>}
      {saveError && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{saveError}</div>}
      {error && <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-zinc-400">Loading routing matrix...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="min-w-[980px] w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border border-zinc-800 bg-zinc-950 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Intent
                </th>
                {LAYERS.map((layer) => {
                  const colors = getLayerColor(layer);
                  return (
                    <th key={layer} className={`border border-zinc-800 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
                      {layerLabel(layer)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {INTENTS.map((intent) => (
                <tr key={intent}>
                  <td className="sticky left-0 z-10 border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-200">
                    {humanIntent(intent)}
                  </td>
                  {LAYERS.map((layer) => {
                    const cellModels = matrix[intent][layer];
                    const layerColor = getLayerColor(layer);
                    return (
                      <td key={layer} className="border border-zinc-800 align-top">
                        <button
                          type="button"
                          onClick={() => setEditingCell({ intent, layer })}
                          className="min-h-[74px] w-full bg-zinc-900 px-2 py-2 text-left transition-colors hover:bg-zinc-800"
                        >
                          {cellModels.length === 0 ? (
                            <span className="text-xs italic text-zinc-500">Select models</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {cellModels.map((modelId) => (
                                <span
                                  key={`${intent}-${layer}-${modelId}`}
                                  className={`rounded-md border px-2 py-0.5 text-xs ${layerColor.bg} ${layerColor.border} ${layerColor.text}`}
                                  title={modelId}
                                >
                                  {modelId}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCell && (
        <ModelSelectionModal
          cell={editingCell}
          allModels={sortedModels}
          selectedModels={matrix[editingCell.intent][editingCell.layer]}
          onClose={() => setEditingCell(null)}
          onSave={(selected) => void saveMatrixCell(editingCell, selected)}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

function ModelSelectionModal({
  cell,
  allModels,
  selectedModels,
  onClose,
  onSave,
  isSaving,
}: {
  cell: MatrixCellRef;
  allModels: Array<{ id: string; provider: string; name: string }>;
  selectedModels: string[];
  onClose: () => void;
  onSave: (selected: string[]) => void;
  isSaving: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(selectedModels);

  const filteredModels = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return allModels;
    return allModels.filter((model) => {
      return (
        model.id.toLowerCase().includes(text) ||
        model.name.toLowerCase().includes(text) ||
        model.provider.toLowerCase().includes(text)
      );
    });
  }, [allModels, query]);

  const toggleModel = (modelId: string) => {
    setSelected((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((item) => item !== modelId);
      }
      return [...prev, modelId];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">Edit Routing Cell</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {humanIntent(cell.intent)} - {layerLabel(cell.layer)}
          </p>
        </div>

        <div className="p-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by provider, name, or model id"
            className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
          />

          <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Selected ({selected.length})</div>
            {selected.length === 0 ? (
              <div className="text-sm text-zinc-500">No models selected for this cell.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map((modelId) => (
                  <button
                    key={modelId}
                    type="button"
                    onClick={() => toggleModel(modelId)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                  >
                    {modelId}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/30 p-2">
            {filteredModels.map((model) => {
              const checked = selected.includes(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => toggleModel(model.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    checked
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <div className="text-sm font-medium">{model.name}</div>
                  <div className="mt-0.5 text-xs text-zinc-400">{model.provider} - {model.id}</div>
                </button>
              );
            })}
            {filteredModels.length === 0 && <div className="px-2 py-6 text-center text-sm text-zinc-500">No models found.</div>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
