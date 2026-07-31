import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Presentation, Layers, HelpCircle, Network, CalendarRange, MessageSquare,
  Sparkles, AlignLeft, GitBranch, Users,
  TrendingUp, Mic, Bot, Wand2, Zap, BarChart3, HeadphonesIcon,
  Globe, ChevronRight, Loader2,
  Hash, Settings2, ChevronDown, FileText, Link as LinkIcon, ExternalLink, AlertCircle, X,
  History
} from 'lucide-react';
import { progress, exp, downloadBlob, rag, history as historyApi } from '../api/client';
import type { Source } from '../features/study/SourceBar';
import { useToast, Tabs, Spinner, Badge } from '../components/ui';
import { cn } from '../lib/cn';

const FEATURES = {
  generation: [
    { id: 'slides', icon: Presentation, title: 'Slides', desc: 'Professional presentation slides', badge: 'Popular', color: 'from-blue-500 to-blue-600' },
    { id: 'flashcards', icon: Layers, title: 'Flashcards', desc: 'Active recall cards', color: 'from-emerald-500 to-emerald-600' },
    { id: 'mindmap', icon: Network, title: 'Mind Map', desc: 'Visual concept relationships', color: 'from-violet-500 to-violet-600' },
    { id: 'plan', icon: CalendarRange, title: 'Study Plan', desc: 'Personalized schedules', color: 'from-purple-500 to-purple-600' },
  ],
  practice: [
    { id: 'quiz', icon: HelpCircle, title: 'Quiz', desc: 'AI-generated quizzes', badge: 'Interactive', color: 'from-blue-500 to-blue-600' },
    { id: 'voice', icon: Mic, title: 'Voice Tutor', desc: 'Voice-enabled tutoring', badge: 'Voice', color: 'from-teal-500 to-teal-600' },
  ],
  analysis: [
    { id: 'graph', icon: GitBranch, title: 'Knowledge Graph', desc: 'Topic relationships', badge: 'Advanced', color: 'from-amber-500 to-amber-600' },
    { id: 'visual', icon: AlignLeft, title: 'Visual Diagrams', desc: 'Flowcharts & diagrams', color: 'from-cyan-500 to-cyan-600' },
    { id: 'predict', icon: TrendingUp, title: 'Predict Topics', desc: 'AI topic prediction', badge: 'AI', color: 'from-purple-500 to-purple-600' },
    { id: 'recommend', icon: Users, title: 'Recommendations', desc: 'Personalized suggestions', color: 'from-pink-500 to-pink-600' },
  ],
  assistant: [
    { id: 'chat', icon: MessageSquare, title: 'Chat', desc: 'RAG-powered conversations', badge: 'Popular', color: 'from-blue-500 to-blue-600' },
    { id: 'agent', icon: Bot, title: 'AI Agent', desc: 'Multi-step reasoning', badge: 'Advanced', color: 'from-amber-500 to-amber-600' },
  ]
};

const CATEGORIES = [
  { id: 'generation', label: 'Generation', icon: Wand2, desc: 'Create study materials' },
  { id: 'practice', label: 'Practice', icon: Zap, desc: 'Test your knowledge' },
  { id: 'analysis', label: 'Analysis', icon: BarChart3, desc: 'Analyze & understand' },
  { id: 'assistant', label: 'Assistant', icon: HeadphonesIcon, desc: 'AI tutoring help' },
];

// Map frontend feature IDs to server history types
const FEATURE_TO_TYPE: Record<string, string> = {
  slides: 'slides', flashcards: 'flashcards', quiz: 'quiz', mindmap: 'mindmap',
  plan: 'studyplan', visual: 'visual',
  predict: 'prediction', recommend: 'recommendation',
  graph: 'graph', weakspot: 'weakspot',
};

function FeatureCard({ icon: Icon, title, desc, onClick, disabled, badge, color }: {
  icon: any; title: string; desc: string; onClick: () => void; disabled?: boolean; badge?: string; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'card p-5 text-left transition-all duration-200 group relative overflow-hidden',
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:shadow-card-hover hover:border-brand-200/50 active:scale-[0.98] cursor-pointer'
      )}
    >
      <div className={cn(
        'w-11 h-11 rounded-xl bg-gradient-to-br text-white flex items-center justify-center mb-3 shadow-sm',
        color || 'from-brand-500 to-purple-600'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold text-ink-900 mb-1">{title}</h3>
      <p className="text-xs text-ink-500 leading-relaxed">{desc}</p>
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full font-medium bg-brand-100 text-brand-700">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function StudyStudio() {
  const toast = useToast();
  const nav = useNavigate();
  const [category, setCategory] = useState('generation');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const buildSource = (): Source => {
    if (sourceMode === 'select' && selectedDocIds.length > 0) {
      return { type: 'multi', value: prompt, docIds: selectedDocIds, useAllDocs: false, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    }
    if (sourceMode === 'custom' && (customText || webUrls.length > 0)) {
      return { type: 'multi', value: prompt, docIds: selectedDocIds.length > 0 ? selectedDocIds : docs.map((d: any) => d.id), useAllDocs: selectedDocIds.length === 0, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
    }
    return { type: 'multi', value: prompt, docIds: docs.map((d: any) => d.id), useAllDocs: true, customText: customText || undefined, urls: webUrls.length > 0 ? webUrls : undefined };
  };

  const hasPrompt = prompt.trim().length > 0;

  const startStudioGeneration = async (feature: string) => {
    setGenerating(true);
    try {
      const currentPrompt = prompt.trim();
      const historyType = FEATURE_TO_TYPE[feature] || feature;
      const source = buildSource();
      const draft = await historyApi.draft({
        type: historyType,
        scope: 'studio',
        title: `${feature}: ${currentPrompt.slice(0, 60)}`,
        prompt: currentPrompt,
        source,
        status: 'planning'
      });
      nav(`/studio/${historyType}/${draft.id}`);
    } catch (e: any) {
      toast('error', 'Failed to initialize generation. Please try again.');
      setGenerating(false);
    }
  };

  // Interactive features (chat, agent, voice) are not one-shot generations —
  // they need their own UI. Navigate directly without creating a draft.
  const INTERACTIVE_FEATURES = ['chat', 'agent', 'voice'];

  const openFeature = async (feature: string) => {
    if (!hasPrompt && !INTERACTIVE_FEATURES.includes(feature)) {
      toast('error', 'Enter a topic or goal first.');
      return;
    }
    // Interactive features go directly to their UI
    if (INTERACTIVE_FEATURES.includes(feature)) {
      nav(`/studio/${feature}`);
      return;
    }
    // All generation features go to planning → confirmation → generation
    await startStudioGeneration(feature);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Study Studio</h1>
          <p className="text-sm text-ink-500 mt-1">
            Transform any material into study-ready assets with AI.
          </p>
        </div>
        <button onClick={() => nav('/studio/history')} className="btn-outline !py-1.5 !px-3 text-xs">
          <History className="w-3.5 h-3.5" /> History
        </button>
      </div>

      {/* Prompt Input - Mandatory */}
      <div className="card p-5 space-y-3 mb-6">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-brand-500" />
          <span className="text-sm font-semibold text-ink-800">What do you want to study?</span>
          <Badge tone="brand">Required</Badge>
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. Photosynthesis for class 10, Machine Learning basics, C programming..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setCategory('generation'); }}
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
              <button key={m.id} onClick={() => setSourceMode(m.id as any)}
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

      {/* Category Tabs */}
      <div className="flex gap-1 mb-6 bg-ink-100 p-1 rounded-lg overflow-x-auto">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              'px-4 py-2.5 rounded-md text-sm font-medium transition flex items-center gap-2 whitespace-nowrap',
              category === cat.id 
                ? 'bg-white text-brand-700 shadow-sm' 
                : 'text-ink-500 hover:text-ink-800'
            )}
          >
            <cat.icon className="w-4 h-4" />
            <span>{cat.label}</span>
            <span className="text-[10px] text-ink-400 font-normal">{cat.desc}</span>
          </button>
        ))}
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {FEATURES[category as keyof typeof FEATURES].map(f => (
          <FeatureCard
            key={f.id}
            icon={f.icon}
            title={f.title}
            desc={f.desc}
            onClick={() => openFeature(f.id)}
            disabled={generating || (!hasPrompt && !INTERACTIVE_FEATURES.includes(f.id))}
            badge={f.badge}
            color={f.color}
          />
        ))}
      </div>

      {/* Generating indicator */}
      {generating && (
        <div className="mt-6 card p-4 text-center">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-ink-600">Creating your study session...</p>
        </div>
      )}

      {/* Prompt Required Notice */}
      {!hasPrompt && !generating && (
        <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Enter a topic or goal above to unlock generation, practice, and analysis features.
          </p>
        </div>
      )}
    </div>
  );
}
