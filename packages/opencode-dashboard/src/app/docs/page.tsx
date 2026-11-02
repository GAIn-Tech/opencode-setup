'use client';

import { useState, useEffect } from 'react';

interface DocFile {
  name: string;
  path: string;
  content?: string;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/docs')
      .then(res => res.json())
      .then(data => {
        setDocs(data.docs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading docs:', err);
        setLoading(false);
      });
  }, []);

  const loadDoc = async (doc: DocFile) => {
    try {
      const res = await fetch(`/api/docs?file=${encodeURIComponent(doc.path)}`);
      const data = await res.json();
      setSelectedDoc({ ...doc, content: data.content });
    } catch (err) {
      console.error('Error loading doc:', err);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Documentation</h1>
        <p className="text-zinc-400 mt-1">
          Browse OpenCode documentation and guides
        </p>
      </div>
      
      <div className="grid grid-cols-4 gap-6">
        {/* Doc list sidebar */}
        <div className="col-span-1 bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-3">Files</h2>
          {loading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : docs.length === 0 ? (
            <p className="text-zinc-500">No docs found</p>
          ) : (
            <ul className="space-y-1">
              {docs.map((doc) => (
                <li key={doc.path}>
                  <button
                    onClick={() => loadDoc(doc)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedDoc?.path === doc.path
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {doc.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Doc content */}
        <div className="col-span-3 bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          {selectedDoc ? (
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 mb-4">{selectedDoc.name}</h2>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono bg-zinc-950 p-4 rounded border border-zinc-800 overflow-auto max-h-[600px]">
                {selectedDoc.content || 'Loading...'}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-zinc-500">
              <div className="text-6xl mb-4">📚</div>
              <p>Select a document from the sidebar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
