import { useState } from 'react';
import { Network, Sparkles, AlignLeft } from 'lucide-react';
import { study, progress } from '../../api/client';
import type { Source } from './SourceBar';
import { useToast, Spinner, EmptyState } from '../../components/ui';
import Mermaid from '../../components/Mermaid';

export default function VisualView({ source, onGenerated }: { source?: Source; onGenerated?: (type: string, id: string) => void }) {
  const toast = useToast();
  const [topic, setTopic] = useState(source?.value || '');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [mermaid, setMermaid] = useState('');
  const [description, setDescription] = useState('');

  const generate = async () => {
    if (!topic.trim()) return toast('error', 'Enter a topic to visualize.');
    setLoading(true);
    try {
      const r = await study.visual({ topic: topic.trim(), source });
      setTitle(r.title);
      setMermaid(r.mermaid);
      setDescription(r.description);
      if ((r as any)._historyId) onGenerated?.('visual', (r as any)._historyId);
      progress.activity({ type: 'visual', topic: topic.trim() });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Visualization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card p-4 flex gap-2">
        <input className="input" placeholder="Topic to visualize (e.g. Photosynthesis, TCP handshake)…" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && generate()} />
        <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Visualize</button>
      </div>

      {!mermaid && !loading && (
        <div className="card mt-4"><EmptyState icon={<Network />} title="Concept Visualizer" hint="Generate a Mermaid diagram that captures how a topic's pieces fit together." /></div>
      )}

      {mermaid && (
        <div className="mt-4 space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-ink-800 mb-3">{title}</h3>
            <Mermaid chart={mermaid} />
          </div>
          {description && (
            <div className="card p-5">
              <h4 className="font-medium text-ink-700 mb-2 flex items-center gap-2"><AlignLeft className="w-4 h-4 text-brand-500" /> Description</h4>
              <p className="text-sm text-ink-700 leading-relaxed">{description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
