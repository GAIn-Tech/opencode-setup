import { Panel } from '@xyflow/react';

type GraphTooltipProps = {
  node: {
    id: string;
    type: string;
    data: Record<string, unknown>;
  };
  typeLabel: Record<string, string>;
  formatValue: (value: unknown) => string;
  onClose: () => void;
};

export function GraphTooltip({ node, typeLabel, formatValue, onClose }: GraphTooltipProps) {
  return (
    <Panel position="bottom-right" className="max-h-[56vh] w-[min(360px,94vw)] overflow-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-100">Metadata</h4>
        <button type="button" onClick={onClose} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800">
          close
        </button>
      </div>
      <div className="space-y-1.5 text-xs text-zinc-300">
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500">id</span>
          <span className="break-all font-mono">{node.id}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-500">type</span>
          <span>{typeLabel[node.type] ?? node.type}</span>
        </div>
        {Object.entries(node.data)
          .filter(([key]) => key !== 'label')
          .map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-t border-zinc-800 pt-1">
              <span className="text-zinc-500">{key}</span>
              <span className="max-w-[200px] break-words text-right">{formatValue(value)}</span>
            </div>
          ))}
      </div>
    </Panel>
  );
}
