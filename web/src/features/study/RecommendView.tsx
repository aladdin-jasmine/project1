import { useState } from 'react';
import { Sparkles, AlertTriangle, Lightbulb, BookOpen, RefreshCw, ClipboardList, HelpCircle } from 'lucide-react';
import { study, progress } from '../../api/client';
import type { Source } from './SourceBar';
import { useToast, Spinner, EmptyState, Badge } from '../../components/ui';
import { cn } from '../../lib/cn';

const SUG_ICON: Record<string, React.ReactNode> = {
  practice: <RefreshCw className="w-4 h-4" />,
  revision: <BookOpen className="w-4 h-4" />,
  resource: <ClipboardList className="w-4 h-4" />,
  quiz: <HelpCircle className="w-4 h-4" />
};

export default function RecommendView({ source }: { source: Source }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [weak, setWeak] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<{ type: 'practice' | 'revision' | 'resource' | 'quiz'; text: string }[]>([]);

  const hasSource = !!source.value || !!source.docId;

  const run = async () => {
    if (!hasSource) return toast('error', 'Choose a source first.');
    setLoading(true);
    try {
      const r = await study.recommend({ source });
      setWeak(r.weakTopics);
      setSuggestions(r.suggestions);
      progress.activity({ type: 'recommend' });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Recommendation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn-primary" onClick={run} disabled={loading || !hasSource}>{loading ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} Get Recommendations</button>
      </div>

      {!suggestions.length && !loading && (
        <div className="card"><EmptyState icon={<Lightbulb />} title="Personalized Recommendations" hint="Identify weak areas from your activity and get targeted practice, revision, and resources." /></div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          {weak.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-ink-800 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Weak Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {weak.map((t) => <Badge key={t} tone="red">{t}</Badge>)}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {suggestions.map((s, i) => (
              <div key={i} className="card p-4 flex gap-3">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', s.type === 'quiz' ? 'bg-brand-50 text-brand-600' : s.type === 'revision' ? 'bg-green-50 text-green-600' : s.type === 'resource' ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600')}>
                  {SUG_ICON[s.type]}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{s.type}</p>
                  <p className="text-sm text-ink-700 mt-0.5">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
