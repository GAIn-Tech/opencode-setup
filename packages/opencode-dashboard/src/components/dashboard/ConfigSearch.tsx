type ConfigSearchProps = {
  searchTerm: string;
  mode: 'raw' | 'form';
  onSearchChange: (value: string) => void;
  onModeChange: (nextMode: 'raw' | 'form') => void;
  onRefresh: () => void;
};

export function ConfigSearch({ searchTerm, mode, onSearchChange, onModeChange, onRefresh }: ConfigSearchProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="text"
        placeholder="Search config keys..."
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-1">
        <button
          type="button"
          onClick={() => onModeChange('raw')}
          className={`rounded px-3 py-1 text-sm ${mode === 'raw' ? 'bg-emerald-600 text-emerald-50' : 'text-zinc-300 hover:bg-zinc-800'}`}
        >
          Raw
        </button>
        <button
          type="button"
          onClick={() => onModeChange('form')}
          className={`rounded px-3 py-1 text-sm ${mode === 'form' ? 'bg-emerald-600 text-emerald-50' : 'text-zinc-300 hover:bg-zinc-800'}`}
        >
          Form
        </button>
      </div>
      <button type="button" onClick={onRefresh} className="rounded-lg bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600">
        Refresh
      </button>
    </div>
  );
}
