type ConfigSectionSource = {
  path: string;
  data: unknown;
};

type ConfigSectionMeta = {
  key: string;
  name: string;
  icon: string;
  description: string;
};

type ConfigSectionProps = {
  section: ConfigSectionMeta;
  config: ConfigSectionSource | undefined;
  isExpanded: boolean;
  isEditing: boolean;
  searchTerm: string;
  onToggle: (sectionKey: string) => void;
  onStartEdit: (sectionKey: string) => void;
  onCopy: (json: string) => void;
  renderEditor: () => JSX.Element;
  renderJsonTree: (data: unknown, searchTerm: string) => JSX.Element;
};

export function ConfigSection({
  section,
  config,
  isExpanded,
  isEditing,
  searchTerm,
  onToggle,
  onStartEdit,
  onCopy,
  renderEditor,
  renderJsonTree,
}: ConfigSectionProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => onToggle(section.key)}
        className="flex w-full items-center justify-between border-b border-zinc-700 px-4 py-3 hover:bg-zinc-800/80"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{section.icon}</span>
          <div className="text-left">
            <div className="font-medium text-zinc-100">{section.name}</div>
            <div className="text-xs text-zinc-500">{section.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config?.data && !isEditing ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartEdit(section.key);
                }}
                className="rounded bg-emerald-600 px-2 py-1 text-xs text-emerald-50 hover:bg-emerald-500"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCopy(JSON.stringify(config.data, null, 2));
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
            renderEditor()
          ) : config?.data ? (
            <div className="max-h-[520px] overflow-auto rounded border border-zinc-700 bg-zinc-950 p-4">
              {renderJsonTree(config.data, searchTerm)}
            </div>
          ) : (
            <div className="rounded bg-zinc-900 p-4 italic text-zinc-500">File not found or invalid JSON</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
