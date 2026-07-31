import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  History as HistoryIcon, Clock, Trash2, Eye, Star, ArrowLeft, Sparkles,
  FileText, Layers, HelpCircle, Network, CalendarRange, StickyNote,
  GitBranch, AlignLeft, TrendingUp, Users, Bot, Lightbulb, Mic,
  ClipboardCheck, FileStack, Loader2, Search
} from 'lucide-react';
import { history as historyApi, type HistoryItem } from '../api/client';
import { EmptyState, Spinner, Badge } from '../components/ui';
import { cn } from '../lib/cn';

const TYPE_ICONS: Record<string, any> = {
  slides: FileText, flashcards: Layers, quiz: HelpCircle, mindmap: Network,
  studyplan: CalendarRange, visual: AlignLeft, graph: GitBranch,
  prediction: TrendingUp, recommendation: Users,
  weakspot: ClipboardCheck,
};

const TYPE_COLORS: Record<string, string> = {
  slides: 'from-blue-500 to-blue-600', flashcards: 'from-emerald-500 to-emerald-600',
  quiz: 'from-blue-500 to-blue-600', mindmap: 'from-violet-500 to-violet-600',
  studyplan: 'from-purple-500 to-purple-600',
  visual: 'from-cyan-500 to-cyan-600', graph: 'from-amber-500 to-amber-600',
  prediction: 'from-purple-500 to-purple-600',
  recommendation: 'from-pink-500 to-pink-600',
  weakspot: 'from-red-500 to-red-600',
};

export default function StudioHistory() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['studio-history', filter],
    queryFn: () => {
      const params: any = { scope: 'studio' };
      if (filter !== 'all') params.type = filter;
      return historyApi.get(params);
    }
  });

  const items = data?.items || [];

  const typeSummary: Record<string, number> = {};
  items.forEach((i: HistoryItem) => {
    typeSummary[i.type] = (typeSummary[i.type] || 0) + 1;
  });

  const allTypes = Object.keys(TYPE_ICONS);
  const availableTypes = [...new Set(items.map((i: HistoryItem) => i.type))].filter(t => allTypes.includes(t));

  const deleteItem = async (id: string) => {
    try {
      await historyApi.delete(id);
      qc.invalidateQueries({ queryKey: ['studio-history'] });
    } catch {}
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/studio')} className="btn-ghost !py-1.5 !px-3 text-xs">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold gradient-text">Studio History</h1>
            <p className="text-sm text-ink-500 mt-1">{data?.total || 0} total generations</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-ink-100 p-1 rounded-lg overflow-x-auto">
        <button onClick={() => setFilter('all')}
          className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap',
            filter === 'all' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
          All ({data?.total || 0})
        </button>
        {availableTypes.map(t => {
          const Icon = TYPE_ICONS[t] || HistoryIcon;
          return (
            <button key={t} onClick={() => setFilter(t)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap',
                filter === t ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
              <Icon className="w-3.5 h-3.5" />
              <span className="capitalize">{t}</span>
              {typeSummary[t] && <span className="text-[10px] bg-brand-100 text-brand-700 px-1 py-0.5 rounded-full">{typeSummary[t]}</span>}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<HistoryIcon />} title="No history" hint="Generate something in the Studio first." />
      ) : (
        <div className="space-y-2">
          {items.map((item: HistoryItem) => {
            const Icon = TYPE_ICONS[item.type] || HistoryIcon;
            const color = TYPE_COLORS[item.type] || 'from-brand-500 to-purple-600';
            return (
              <div key={item.id} className="card-hover p-4 flex items-start gap-3 cursor-pointer"
                onClick={() => nav(`/studio/${item.type}/${item.id}`)}>
                <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br text-white flex items-center justify-center shrink-0', color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-ink-800 text-sm truncate">{item.title}</p>
                    <div className="shrink-0"><Badge tone="brand">{item.type}</Badge></div>
                    {item.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.metadata.generatedAt).toLocaleDateString()}</span>
                    {item.metadata?.source?.value && <span className="truncate">— {item.metadata.source.value}</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                  className="btn-ghost !py-1.5 !px-2 text-xs text-red-500 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
