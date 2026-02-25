type ConfigEditorProps = {
  content: string;
  saveError: string | null;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ConfigEditor({ content, saveError, isSaving, onChange, onSave, onCancel }: ConfigEditorProps) {
  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={(event) => onChange(event.target.value)}
        rows={18}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
        spellCheck={false}
      />
      {saveError ? <div className="text-sm text-red-500">{saveError}</div> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="rounded bg-emerald-600 px-4 py-2 text-emerald-50 hover:bg-emerald-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
