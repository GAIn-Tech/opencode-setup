'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { InteractiveKnowledgeGraph } from '@/components/dashboard/InteractiveKnowledgeGraph';

export default function GraphPage() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
  };

  const exportDot = async () => {
    const response = await fetch('/api/memory-graph?format=dot');
    if (!response.ok) return;
    const dot = await response.text();
    const blob = new Blob([dot], { type: 'text/vnd.graphviz' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'memory-graph.dot';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPng = async () => {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current, { cacheBust: true });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'memory-graph.png';
    anchor.click();
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  return (
    <div className="h-full min-h-screen p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Interactive Knowledge Graph</h1>
          <p className="text-sm text-zinc-400">Dedicated full-frame graph workspace with drag/zoom and live updates.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void exportDot()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Export DOT
          </button>
          <button
            type="button"
            onClick={() => void exportPng()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`rounded-xl border border-zinc-800 bg-zinc-950 ${isFullscreen ? 'h-screen p-4' : 'h-[calc(100vh-190px)] min-h-[760px] p-2'}`}
      >
        <InteractiveKnowledgeGraph selectedNode={selectedNode} onNodeSelect={setSelectedNode} />
      </div>
    </div>
  );
}
