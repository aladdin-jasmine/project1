import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MindMap } from './types';

// Presentational ReactFlow renderer for a MindMap (shared by MindMapView and Notes).
export default function MindMapCanvas({ map }: { map: MindMap }) {
  const { nodes, edges } = useMemo(() => {
    const byId = new Map<string, any>();
    byId.set('root', { id: 'root', label: map.root });
    map.nodes.forEach((n) => byId.set(n.id, n));
    const depth = (id: string, seen = new Set<string>()): number => {
      if (id === 'root') return 0;
      if (seen.has(id)) return 0;
      seen.add(id);
      const n = byId.get(id);
      const p = n?.parent ? (byId.has(n.parent) ? n.parent : 'root') : 'root';
      return 1 + depth(p, seen);
    };
    const depths = new Map<string, number>();
    byId.forEach((_, id) => depths.set(id, depth(id)));
    const perDepth = new Map<number, string[]>();
    byId.forEach((_, id) => {
      const d = depths.get(id)!;
      if (!perDepth.has(d)) perDepth.set(d, []);
      perDepth.get(d)!.push(id);
    });
    const rfNodes: Node[] = [];
    perDepth.forEach((ids, d) => {
      ids.forEach((id, i) => {
        const n = byId.get(id);
        rfNodes.push({
          id,
          position: { x: i * 200 - ((ids.length - 1) * 100), y: d * 130 },
          data: { label: n.label },
          style: id === 'root'
            ? { background: '#1f41f5', color: '#fff', border: '1px solid #1f41f5', borderRadius: 8, padding: 6, fontWeight: 600 }
            : { background: '#fff', border: '1px solid #c9d2e0', borderRadius: 8, padding: 6 }
        });
      });
    });
    const rfEdges: Edge[] = [];
    map.nodes.forEach((n) => {
      const p = n.parent && byId.has(n.parent) ? n.parent : 'root';
      rfEdges.push({ id: `${p}-${n.id}`, source: p, target: n.id, animated: true, style: { stroke: '#3563ff' } });
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [map]);

  return (
    <div className="card h-[420px] overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
