import { useState } from 'react';
import { Network, Sparkles } from 'lucide-react';
import { study, progress } from '../../api/client';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import type { MindMap } from './types';
import type { Source as Src } from './SourceBar';
import MindMapCanvas from './MindMapCanvas';

export default function MindMapView({ source, map, setMap }: { source: Src; map: MindMap | null; setMap: (m: MindMap | null) => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!source.value && !source.docId) return toast('error', 'Choose a source first.');
    setLoading(true);
    try {
      const m = await study.mindmap({ source });
      setMap(m);
      progress.activity({ type: 'mindmap' });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!map) {
    return (
      <div className="card">
        <EmptyState icon={<Network />} title="Generate a mind map" hint="Visualize how concepts connect for faster recall."
          action={<button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Generate Mind Map</button>} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Regenerate</button>
        <span className="text-sm text-ink-500">{map.nodes.length} nodes</span>
      </div>
      <MindMapCanvas map={map} />
    </div>
  );
}
