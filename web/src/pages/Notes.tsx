import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  StickyNote, BookOpen, FileText, Layers, 
  MessageSquare, History as HistoryIcon, Settings2, 
  Trash2, Sparkles, Clock, Star, Eye, X, Loader2,
  GraduationCap, Target, Hash, Globe, Link as LinkIcon, ExternalLink, AlertCircle,
  ChevronDown
} from 'lucide-react';
import { useToast, Badge, EmptyState, Modal } from '../components/ui';
import { cn } from '../lib/cn';
import { study, history as historyApi, rag } from '../api/client';

type NotesTab = 'generate' | 'history';

const NOTE_TYPES = [
  { id: 'short-notes', label: 'Short Notes', icon: BookOpen, desc: 'Quick 2-mark revision notes', color: 'from-blue-500 to-blue-600' },
  { id: 'exam-notes', label: 'Exam Notes', icon: GraduationCap, desc: 'Comprehensive exam preparation', color: 'from-emerald-500 to-emerald-600' },
  { id: '5-mark', label: '5-Mark Q&A', icon: Target, desc: 'Five-mark questions and answers', color: 'from-amber-500 to-amber-600' },
  { id: '10-mark', label: '10-Mark Q&A', icon: Target, desc: 'Detailed ten-mark answers', color: 'from-orange-500 to-orange-600' },
  { id: 'one-page', label: 'One-Page Summary', icon: FileText, desc: 'Concise one-page revision sheet', color: 'from-violet-500 to-violet-600' },
  { id: 'viva-questions', label: 'Viva Questions', icon: MessageSquare, desc: 'Oral exam practice questions', color: 'from-purple-500 to-purple-600' },
];

const subtypeToUrl = (type: string): string => {
  const map: Record<string, string> = {
    'short-notes': 'shortnotes', 'exam-notes': 'examnotes',
    '5-mark': '5-mark', '10-mark': '10-mark',
    'one-page': 'onepage', 'viva-questions': 'viva',
  };
  return map[type] || type;
};

export default function Notes() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<NotesTab>('generate');
  const [selectedNoteType, setSelectedNoteType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState(params.get('prompt') || '');
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [clearConfirm, setClearConfirm] = useState(false);

  // Source options
  const [showSourceOpts, setShowSourceOpts] = useState(false);
  const [sourceMode, setSourceMode] = useState<'all' | 'select' | 'custom'>('all');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webUrls, setWebUrls] = useState<string[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');

  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

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
      if (data.error) { setWebError(data.error); return; }
      setWebUrls(prev => [...prev, webUrl.trim()]);
      setWebUrl('');
    } catch (e: any) {
      setWebError(e.message || 'Failed to fetch URL');
    } finally { setWebLoading(false); }
  };

  const { data: docs = [] } = useQuery({ queryKey: ['docs'], queryFn: () => rag.docs() });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['history', 'notes', historyFilter],
    queryFn: () => {
      const params: any = { type: 'notes' };
      if (historyFilter !== 'all') params.subType = historyFilter;
      return historyApi.get(params);
    }
  });

  const historyItems = historyData?.items || [];

  const buildSource = () => {
    if (sourceMode === 'select' && selectedDocIds.length > 0) {
      return { type: 'multi' as const, value: prompt.trim(), docIds: selectedDocIds, useAllDocs: false, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    }
    if (sourceMode === 'custom' && (customText || webUrls.length > 0)) {
      return { type: 'multi' as const, value: prompt.trim(), docIds: selectedDocIds.length > 0 ? selectedDocIds : docs.map((d: any) => d.id), useAllDocs: selectedDocIds.length === 0, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    }
    return { type: 'multi' as const, value: prompt.trim(), docIds: docs.map((d: any) => d.id), useAllDocs: true, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
  };

  // Step 1: Create draft with planning status
  const startGeneration = useCallback(async (type: string) => {
    if (!prompt.trim()) return;
    setGenerating(true);

    try {
      const currentPrompt = prompt.trim();
      const urlSubType = subtypeToUrl(type);
      const source = buildSource();
      const draft = await historyApi.draft({
        type: 'notes',
        scope: 'notes',
        subType: type,
        title: `${NOTE_TYPES.find(t => t.id === type)?.label || type}: ${currentPrompt.slice(0, 60)}`,
        prompt: currentPrompt,
        source,
        status: 'planning'
      });
      nav(`/notes/${urlSubType}/${draft.id}`);
    } catch (e: any) {
      toast('error', 'Failed to initialize. Please try again.');
      setGenerating(false);
    }
  }, [prompt, nav, historyApi, toast]);

  const clearHistory = async () => {
    try {
      await historyApi.clear({ type: 'notes' });
      qc.invalidateQueries({ queryKey: ['history'] });
      toast('success', 'Notes history cleared.');
      setClearConfirm(false);
    } catch (e: any) {
      toast('error', 'Failed to clear history');
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await historyApi.delete(id);
      qc.invalidateQueries({ queryKey: ['history'] });
      toast('success', 'Item deleted.');
    } catch (e: any) {
      toast('error', 'Failed to delete item');
    }
  };

  // Persist prompt to URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (prompt) next.set('prompt', prompt);
    setParams(next, { replace: true });
  }, [prompt]);

  const getTypeIcon = (subType?: string) => {
    const found = NOTE_TYPES.find(t => t.id === subType);
    if (found) return found.icon;
    return StickyNote;
  };

  const getTypeLabel = (subType?: string) => {
    if (!subType) return 'Notes';
    return subType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Smart Notes</h1>
          <p className="text-sm text-ink-500 mt-1">Turn any material into structured, exam-ready notes with AI.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setClearConfirm(true)}
            className="btn-ghost !py-1.5 !px-3 text-xs text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear History
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-ink-100 p-1 rounded-lg w-fit">
        {(['generate', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
              activeTab === tab 
                ? 'bg-white text-brand-700 shadow-sm' 
                : 'text-ink-500 hover:text-ink-800'
            )}
          >
            {tab === 'generate' ? <Sparkles className="w-4 h-4" /> : <HistoryIcon className="w-4 h-4" />}
            {tab === 'generate' ? 'Generate' : 'History'}
            {tab === 'history' && historyItems.length > 0 && (
              <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">
                {historyItems.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'generate' && (
        <>
          {/* Prompt Input */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-semibold text-ink-800">What do you want to study?</span>
              <Badge tone="brand">Required</Badge>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. Photosynthesis for class 10 exam, Machine Learning basics, World War II causes..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <p className="text-xs text-ink-400">
              {sourceMode === 'select' && selectedDocIds.length > 0
                ? `${selectedDocIds.length} document(s) selected`
                : sourceMode === 'custom'
                  ? `Using custom source${customText ? ' + text' : ''}${webUrls.length > 0 ? ' + web' : ''}`
                  : `All ${docs.length} knowledge base documents used as context`}
            </p>
            <button onClick={() => setShowSourceOpts(!showSourceOpts)}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium">
              <Settings2 className="w-3.5 h-3.5" /> Source options
              <ChevronDown className={cn('w-3 h-3 transition', showSourceOpts && 'rotate-180')} />
            </button>
          </div>

          {/* Collapsible Source Options */}
          {showSourceOpts && (
            <div className="card p-4 mt-3 space-y-3 animate-scale-in">
              <div className="flex items-center gap-2 mb-2">
                <Badge tone="brand">Optional</Badge>
                <span className="text-xs text-ink-500">Override default sources</span>
              </div>
              <div className="flex gap-2">
                {[
                  { id: 'all', label: 'All Documents' },
                  { id: 'select', label: 'Select Files' },
                  { id: 'custom', label: 'Custom' }
                ].map(m => (
                  <button key={m.id} onClick={() => { setSourceMode(m.id as any); setShowSourceOpts(true); }}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition',
                      sourceMode === m.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                    )}>
                    {m.label}
                  </button>
                ))}
              </div>
              {sourceMode === 'select' && (
                <div className="max-h-40 overflow-y-auto space-y-1 border border-ink-200 rounded-lg p-2">
                  {docs.map((d: any) => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedDocIds.includes(d.id)}
                        onChange={() => toggleDoc(d.id)} className="w-3.5 h-3.5 accent-brand-600" />
                      <FileText className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      <span className="truncate text-ink-700">{d.name}</span>
                      {d.subject && <span className="text-xs text-ink-400 shrink-0">({d.subject})</span>}
                    </label>
                  ))}
                </div>
              )}
              {sourceMode === 'custom' && (
                <div className="space-y-2">
                  <textarea className="input h-24 resize-y" placeholder="Paste custom text (optional)..."
                    value={customText} onChange={(e) => setCustomText(e.target.value)} />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input type="url" className="input pl-9" placeholder="https://en.wikipedia.org/wiki/..."
                        value={webUrl} onChange={(e) => setWebUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleWebFetch(); }} />
                    </div>
                    <button className="btn-primary" onClick={handleWebFetch} disabled={webLoading || !webUrl.trim()}>
                      {webLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Add URL
                    </button>
                  </div>
                  {webError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{webError}</p>}
                  {webUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {webUrls.map((u, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                          <Globe className="w-3 h-3" />{u.slice(0, 40)}...
                          <button onClick={() => setWebUrls(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Note Type Selection */}
          <div className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {NOTE_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = selectedNoteType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => {
                      if (!prompt.trim()) {
                        toast('error', 'Enter a topic or goal first.');
                        return;
                      }
                      setSelectedNoteType(type.id);
                      startGeneration(type.id);
                    }}
                    disabled={generating || !prompt.trim()}
                    className={cn(
                      'card p-4 text-left transition-all duration-200 border-2 group',
                      isSelected ? 'border-brand-500 bg-brand-50/50' : 'border-transparent hover:border-brand-200 hover:shadow-md',
                      (generating || !prompt.trim()) && isSelected ? 'opacity-75' : '',
                      !prompt.trim() && !generating ? 'opacity-50 cursor-not-allowed' : ''
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg bg-gradient-to-br text-white flex items-center justify-center mb-2.5 shadow-sm',
                      type.color
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="font-semibold text-ink-800 text-sm">{type.label}</p>
                    <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{type.desc}</p>
                  </button>
                );
              })}
            </div>

            {generating && (
              <div className="card p-8 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                  <p className="text-sm text-ink-600">Creating your notes session...</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setHistoryFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                historyFilter === 'all' ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              )}
            >
              All
            </button>
            {NOTE_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => setHistoryFilter(type.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  historyFilter === type.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                )}
              >
                {type.label}
              </button>
            ))}
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : historyItems.length === 0 ? (
            <div className="card">
              <EmptyState 
                icon={<HistoryIcon />} 
                title="No notes history" 
                hint="Generate some notes first and they'll appear here." 
              />
            </div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((item: any) => {
                const Icon = getTypeIcon(item.subType);
                return (
                  <div key={item.id} className="card-hover p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-ink-800 truncate">{item.title}</p>
                          <Badge tone="brand">{getTypeLabel(item.subType)}</Badge>
                          {item.isFavorite && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-ink-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(item.metadata.generatedAt).toLocaleDateString()}
                          </span>
                          {item.metadata.noteType && (
                            <span>{NOTE_TYPES.find(t => t.id === item.metadata.noteType)?.label || item.metadata.noteType}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => nav(`/notes/${subtypeToUrl(item.subType || 'short-notes')}/${item.id}`)}
                          className="btn-soft !py-1.5 !px-2.5 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button 
                          onClick={() => deleteItem(item.id)}
                          className="btn-ghost !py-1.5 !px-2 text-xs text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        title="Clear Notes History?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setClearConfirm(false)}>Cancel</button>
            <button className="btn-danger" onClick={clearHistory}>Clear All</button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          This will permanently delete all generated notes history. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
