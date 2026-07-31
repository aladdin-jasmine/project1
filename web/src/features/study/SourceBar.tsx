import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, ClipboardPaste, Hash, Globe, BookOpen, 
  Search, X, Sparkles, ChevronDown, Link as LinkIcon, 
  ExternalLink, AlertCircle
} from 'lucide-react';
import { rag } from '../../api/client';
import { cn } from '../../lib/cn';
import { Badge, Spinner } from '../../components/ui';

export interface Source {
  type: 'doc' | 'text' | 'topic' | 'web' | 'multi';
  value?: string;
  docId?: string;
  docIds?: string[];
  urls?: string[];
  customText?: string;
  useAllDocs?: boolean;
}

const SOURCE_TABS = [
  { id: 'doc', label: 'Knowledge Base', icon: BookOpen, desc: 'Select from uploaded documents' },
  { id: 'text', label: 'Paste Text', icon: ClipboardPaste, desc: 'Paste your study material' },
  { id: 'topic', label: 'By Topic', icon: Hash, desc: 'Enter a topic or subject' },
  { id: 'web', label: 'Web URL', icon: Globe, desc: 'Scrape content from a website' },
] as const;

function SourceTab({ tab, active, onClick }: { 
  tab: typeof SOURCE_TABS[number]; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border',
        active 
          ? 'bg-gradient-to-r from-brand-50 to-purple-50 border-brand-200/50 text-brand-700 shadow-sm' 
          : 'text-ink-500 hover:text-ink-800 hover:bg-ink-50 border-transparent'
      )}
    >
      <tab.icon className={cn('w-4 h-4', active ? 'text-brand-600' : 'text-ink-400')} />
      <div className="text-left">
        <span className="block text-xs font-semibold">{tab.label}</span>
        <span className="block text-[10px] text-ink-400 font-normal">{tab.desc}</span>
      </div>
    </button>
  );
}

export default function SourceBar({ source, onChange }: { source: Source; onChange: (s: Source) => void }) {
  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: () => rag.docs() });
  const [tab, setTab] = useState<Source['type']>(source.type);
  const [webUrl, setWebUrl] = useState('');
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [customText, setCustomText] = useState('');

  const set = (patch: Partial<Source>) => onChange({ ...source, ...patch, type: tab });

  const handleWebFetch = async () => {
    if (!webUrl.trim()) return;
    setWebLoading(true);
    setWebError('');
    try {
      const res = await fetch('/api/source/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webUrl.trim() })
      });
      const data = await res.json();
      if (data.error) {
        setWebError(data.error);
        return;
      }
      set({ 
        type: 'web', 
        value: data.content, 
        urls: [webUrl.trim()],
        customText: data.title || webUrl.trim()
      });
    } catch (e: any) {
      setWebError(e.message || 'Failed to fetch URL');
    } finally {
      setWebLoading(false);
    }
  };

  const handleTabChange = (newTab: Source['type']) => {
    setTab(newTab);
    onChange({ type: newTab });
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <span className="text-sm font-semibold text-ink-800">Source</span>
        {source.type === 'web' && <Badge tone="teal">Web</Badge>}
        {source.type === 'multi' && <Badge tone="brand">Multi</Badge>}
        {source.type === 'doc' && source.docId && <Badge tone="gray">Document</Badge>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SOURCE_TABS.map((t) => (
          <SourceTab key={t.id} tab={t} active={tab === t.id} onClick={() => handleTabChange(t.id)} />
        ))}
      </div>

      {tab === 'doc' && (
        <div className="space-y-3">
          <select 
            className="input" 
            value={source.docId || ''} 
            onChange={(e) => set({ docId: e.target.value, value: undefined, docIds: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Select a document from your knowledge base...</option>
            {docs.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.subject ? `(${d.subject})` : ''} {d.chapter ? `- ${d.chapter}` : ''}
              </option>
            ))}
          </select>
          {docs.length > 5 && (
            <p className="text-xs text-ink-400">{docs.length} documents available</p>
          )}
        </div>
      )}

      {tab === 'text' && (
        <div className="space-y-2">
          <textarea 
            className="input h-36 resize-y" 
            placeholder="Paste or type the study material here... Supports markdown, code blocks, and structured text."
            value={source.value || ''} 
            onChange={(e) => set({ value: e.target.value, docId: undefined })} 
          />
          {source.value && source.value.length > 100 && (
            <p className="text-xs text-ink-400">{source.value.length} characters</p>
          )}
        </div>
      )}

      {tab === 'topic' && (
        <div className="space-y-2">
          <input 
            className="input" 
            placeholder="e.g. Photosynthesis, World War II, Calculus, Machine Learning" 
            value={source.value || ''} 
            onChange={(e) => set({ value: e.target.value, docId: undefined })} 
          />
          <p className="text-xs text-ink-400">
            Enter any topic or subject. The AI will use your knowledge base and training data.
          </p>
        </div>
      )}

      {tab === 'web' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="url"
                className="input pl-9"
                placeholder="https://en.wikipedia.org/wiki/..."
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWebFetch(); }}
              />
            </div>
            <button 
              className="btn-primary" 
              onClick={handleWebFetch} 
              disabled={webLoading || !webUrl.trim()}
            >
              {webLoading ? <Spinner className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
              Fetch
            </button>
          </div>
          {webError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{webError}</p>
            </div>
          )}
          {source.value && source.type === 'web' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs text-emerald-700 font-medium">✓ Content fetched successfully</p>
              <p className="text-xs text-emerald-600 mt-1">{source.value.length} characters loaded</p>
            </div>
          )}
          <p className="text-xs text-ink-400">
            Supports Wikipedia, GeeksforGeeks, and other public websites. Some sites may require login or block scraping.
          </p>
        </div>
      )}
    </div>
  );
}
