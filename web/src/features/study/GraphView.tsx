import { useState, useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, type Node, type Edge, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Share2, Sparkles, FileText, BookOpen } from 'lucide-react';
import { study, progress, type KnowledgeDoc } from '../../api/client';
import type { Source } from './SourceBar';
import { useToast, Spinner, EmptyState, Badge } from '../../components/ui';

const DOC_COLORS = [
  '#1f41f5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777',
  '#0891b2', '#65a30d', '#ca8a04', '#c026d3', '#2563eb', '#0d9488'
];
const docColorMap = new Map<string, string>();

function getDocColor(docName: string): string {
  if (!docColorMap.has(docName)) {
    docColorMap.set(docName, DOC_COLORS[docColorMap.size % DOC_COLORS.length]);
  }
  return docColorMap.get(docName)!;
}

function getNodeShapeStyle(doc: string, isCentral: boolean) {
  const color = getDocColor(doc);
  return {
    background: isCentral ? `${color}1a` : '#fff',
    border: `2px solid ${color}`,
    borderRadius: isCentral ? 16 : 8,
    padding: isCentral ? 12 : 8,
    fontSize: 13,
    color: isCentral ? color : '#1e293b',
    fontWeight: isCentral ? 700 : 500,
    width: isCentral ? 180 : 150,
    boxShadow: isCentral ? `0 4px 12px ${color}33` : undefined,
  };
}

export default function GraphView({ source, onGenerated }: { source: Source; onGenerated?: (type: string, id: string) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [graph, setGraph] = useState<{ nodes: { id: string; label: string; doc: string }[]; edges: { source: string; target: string; label?: string }[] } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const hasSource = !!source.value || !!source.docId;

  const generate = async () => {
    if (!hasSource) return toast('error', 'Choose a source first.');
    setLoading(true);
    docColorMap.clear();
    setSelectedNode(null);
    try {
      const g = await study.graph({ source, topic: topic.trim() || undefined });
      setGraph(g);
      if ((g as any)._historyId) onGenerated?.('graph', (g as any)._historyId);
      progress.activity({ type: 'graph', topic: topic.trim() });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Graph generation failed');
    } finally {
      setLoading(false);
    }
  };

  // Collect unique documents
  const uniqueDocs = useMemo(() => {
    if (!graph) return [];
    const docSet = new Set(graph.nodes.map((n) => n.doc));
    return [...docSet];
  }, [graph]);

  // Assign colors to documents
  useMemo(() => {
    docColorMap.clear();
    uniqueDocs.forEach((doc) => getDocColor(doc));
  }, [uniqueDocs]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const docFrequency = new Map<string, number>();
    graph.nodes.forEach((n) => docFrequency.set(n.doc, (docFrequency.get(n.doc) || 0) + 1));
    const centralDoc = [...docFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    // Use a simple grid layout with document grouping
    const byDoc = new Map<string, typeof graph.nodes>();
    graph.nodes.forEach((n) => {
      if (!byDoc.has(n.doc)) byDoc.set(n.doc, []);
      byDoc.get(n.doc)!.push(n);
    });

    const rfNodes: Node[] = [];
    let xOffset = 0;
    const colWidth = 200;
    const rowHeight = 110;

    byDoc.forEach((nodes, doc) => {
      const cols = Math.ceil(Math.sqrt(nodes.length)) || 1;
      nodes.forEach((n, i) => {
        rfNodes.push({
          id: n.id,
          position: { x: xOffset + (i % cols) * colWidth, y: Math.floor(i / cols) * rowHeight },
          data: { label: n.label, doc: n.doc },
          style: getNodeShapeStyle(doc, doc === centralDoc),
        });
      });
      xOffset += cols * colWidth + 40;
    });

    const rfEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      labelStyle: { fontSize: 10, fill: '#64748b' },
    }));
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(selectedNode === node.id ? null : node.id);
  }, [selectedNode]);

  if (!graph) {
    return (
      <div className="card">
        <EmptyState icon={<Share2 />} title="Knowledge Graph" hint="Map how concepts from your documents connect, with multi-document provenance and color-coded sources."
          action={
            <div className="max-w-md mx-auto w-full space-y-2">
              <input className="input" placeholder="Optional focus topic…" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <button className="btn-primary w-full" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Graph</button>
            </div>
          }
        />
      </div>
    );
  }

  const selectedData = graph.nodes.find((n) => n.id === selectedNode);

  return (
    <div className="grid lg:grid-cols-[1fr_220px] gap-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate
          </button>
          <span className="text-sm text-ink-500">{graph.nodes.length} nodes · {graph.edges.length} edges</span>
        </div>
        <div className="card h-[460px] overflow-hidden">
          <ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={onNodeClick}>
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
      <div className="space-y-3">
        <div className="card p-3">
          <h4 className="text-xs font-semibold text-ink-600 flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5" /> Documents
          </h4>
          <div className="space-y-1.5">
            {uniqueDocs.map((doc) => (
              <div key={doc} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: getDocColor(doc) }} />
                <span className="text-ink-600 truncate">{doc}</span>
                <span className="text-ink-400 ml-auto">{graph.nodes.filter((n) => n.doc === doc).length}</span>
              </div>
            ))}
          </div>
        </div>
        {selectedData && (
          <div className="card p-3 animate-scale-in">
            <h4 className="text-xs font-semibold text-ink-600 flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5" /> Selected Node
            </h4>
            <p className="text-sm font-medium text-ink-800">{selectedData.label}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: getDocColor(selectedData.doc) }} />
              <span className="text-xs text-ink-500">{selectedData.doc}</span>
            </div>
          </div>
        )}
        <div className="card p-3">
          <h4 className="text-xs font-semibold text-ink-600 mb-1.5">Legend</h4>
          <div className="space-y-1 text-[10px] text-ink-500">
            <p><span className="inline-block w-3 h-3 rounded-full border-2 align-middle mr-1" style={{ borderColor: '#94a3b8' }} /> Node — concept</p>
            <p><span className="inline-block w-4 h-0.5 bg-slate-300 align-middle mr-1" /> Edge — relationship</p>
            <p><span className="inline-block w-3 h-3 rounded-full border-2 border-brand-500 bg-brand-50 align-middle mr-1" /> Central — primary doc</p>
          </div>
        </div>
      </div>
    </div>
  );
}
