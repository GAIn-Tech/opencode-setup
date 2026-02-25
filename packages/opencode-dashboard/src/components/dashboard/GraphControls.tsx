import { Panel } from '@xyflow/react';

type GraphControlsProps<TNodeType extends string> = {
  knownTypes: readonly TNodeType[];
  typeLabel: Record<TNodeType, string>;
  typeColors: Record<TNodeType, string>;
  typeCounts: Record<TNodeType, number>;
  activeTypes: Record<TNodeType, boolean>;
  searchTerm: string;
  focusDepth: 1 | 2;
  sinceDays: number;
  apiMaxFanout: number;
  apiMaxNodes: number;
  minEdgeStrength: number;
  maxVisibleEdges: number;
  autoEdgeControls: boolean;
  effectiveTier: number;
  viewportZoom: number;
  visibleEdgeCount: number;
  onTypeToggle: (type: TNodeType) => void;
  onSearchTermChange: (value: string) => void;
  onSelectFromSearch: () => void;
  onToggleFocusDepth: () => void;
  onToggleTier: (tier: 0 | 1 | 2) => void;
  onClearFocus: () => void;
  onSinceDaysChange: (value: number) => void;
  onApiMaxFanoutChange: (value: number) => void;
  onApiMaxNodesChange: (value: number) => void;
  onApplyApi: () => void;
  onMinEdgeStrengthChange: (value: number) => void;
  onMaxVisibleEdgesChange: (value: number) => void;
  onToggleAutoEdges: () => void;
};

export function GraphControls<TNodeType extends string>({
  knownTypes,
  typeLabel,
  typeColors,
  typeCounts,
  activeTypes,
  searchTerm,
  focusDepth,
  sinceDays,
  apiMaxFanout,
  apiMaxNodes,
  minEdgeStrength,
  maxVisibleEdges,
  autoEdgeControls,
  effectiveTier,
  viewportZoom,
  visibleEdgeCount,
  onTypeToggle,
  onSearchTermChange,
  onSelectFromSearch,
  onToggleFocusDepth,
  onToggleTier,
  onClearFocus,
  onSinceDaysChange,
  onApiMaxFanoutChange,
  onApiMaxNodesChange,
  onApplyApi,
  onMinEdgeStrengthChange,
  onMaxVisibleEdgesChange,
  onToggleAutoEdges,
}: GraphControlsProps<TNodeType>) {
  return (
    <Panel position="top-left" className="w-[min(560px,92vw)] rounded-xl border border-zinc-700 bg-zinc-900/90 p-3 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {knownTypes.map((type) => {
          const enabled = activeTypes[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => onTypeToggle(type)}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                enabled ? 'border-zinc-500 bg-zinc-800 text-zinc-100' : 'border-zinc-700 bg-zinc-900 text-zinc-500'
              }`}
              style={enabled ? { boxShadow: `inset 0 0 0 1px ${typeColors[type]}66` } : undefined}
            >
              {typeLabel[type]} {typeCounts[type]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search by id, label, pattern, context"
          className="min-w-[220px] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
        />
        <button type="button" onClick={onSelectFromSearch} className="rounded-md border border-cyan-600/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/25">
          Select match
        </button>
        <button type="button" onClick={onToggleFocusDepth} className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
          Neighborhood {focusDepth}-hop
        </button>
        <button type="button" onClick={() => onToggleTier(0)} className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
          Group view
        </button>
        <button type="button" onClick={() => onToggleTier(1)} className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
          Type view
        </button>
        <button type="button" onClick={() => onToggleTier(2)} className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
          Instance view
        </button>
        <button type="button" onClick={onClearFocus} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
          Clear focus
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        <label className="flex items-center gap-2">
          <span>Days</span>
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={sinceDays}
            onChange={(event) => onSinceDaysChange(Number.parseInt(event.target.value, 10))}
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex items-center gap-2">
          <span>API fanout</span>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={apiMaxFanout}
            onChange={(event) => onApiMaxFanoutChange(Number.parseInt(event.target.value, 10))}
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex items-center gap-2">
          <span>API nodes</span>
          <input
            type="number"
            min={20}
            max={2000}
            step={20}
            value={apiMaxNodes}
            onChange={(event) => onApiMaxNodesChange(Number.parseInt(event.target.value, 10))}
            className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
          />
        </label>
        <button type="button" onClick={onApplyApi} className="rounded-md border border-cyan-600/40 bg-cyan-500/15 px-2 py-1 text-cyan-200 hover:bg-cyan-500/25">
          Apply API
        </button>
        <label className="flex items-center gap-2">
          <span>Edge min strength</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={minEdgeStrength}
            onChange={(event) => onMinEdgeStrengthChange(Number(event.target.value))}
            className="accent-emerald-500"
          />
          <span className="font-mono text-zinc-200">{minEdgeStrength}</span>
        </label>
        <label className="flex items-center gap-2">
          <span>Max edges</span>
          <input
            type="number"
            min={25}
            max={1500}
            step={25}
            value={maxVisibleEdges}
            onChange={(event) => onMaxVisibleEdgesChange(Number.parseInt(event.target.value, 10))}
            className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={onToggleAutoEdges}
          className={`rounded-md border px-2 py-1 ${
            autoEdgeControls ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300'
          }`}
        >
          {autoEdgeControls ? 'Auto edges' : 'Manual edges'}
        </button>
        <span className="text-zinc-500">Visible edges: {visibleEdgeCount}</span>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Tier {effectiveTier} • zoom {viewportZoom.toFixed(2)} • drag to rearrange, scroll to zoom, click nodes to drill down.
      </p>
    </Panel>
  );
}
