import { useEffect, useState, Component, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings2, Save, RotateCcw, AlertTriangle, Server, Zap, Brain, 
  Image, Mic, Volume2, Database, ChevronDown, ChevronRight,
  Search, X, Loader2, CheckCircle2, Info, AlertTriangle as AlertIcon
} from 'lucide-react';
import { settings as settingsApi, providers, type AdvancedSettings } from '../api/client';
import { useToast, Badge, Spinner, Tabs } from '../components/ui';
import { cn } from '../lib/cn';
import TaskModelSelector, { type TaskModelConfig, type TaskType } from '../components/TaskModelSelector';

// ── Error Boundary ──
class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-3xl mx-auto animate-fade-in">
          <div className="card p-8 text-center">
            <AlertIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-ink-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-ink-500 mb-4">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button className="btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TASK_LABELS: Record<TaskType, string> = {
  slides: 'Slides Generation',
  flashcards: 'Flashcards',
  quiz: 'Quiz Generation',
  mindmap: 'Mind Map',
  studyplan: 'Study Plan',
  chat: 'Chat (RAG)',
  agent: 'AI Agent',
  notes: 'Notes Generation',
  visual: 'Visual Diagrams',
  graph: 'Knowledge Graph',
  recommend: 'Recommendations',
  predict: 'Topic Prediction',
  'voice-stt': 'Voice Speech-to-Text',
  'voice-tts': 'Voice Text-to-Speech',
  embeddings: 'Embeddings'
};

const TASK_CATEGORIES = {
  generation: ['slides', 'flashcards', 'notes', 'mindmap', 'studyplan'] as TaskType[],
  practice: ['quiz'] as TaskType[],
  analysis: ['graph', 'visual', 'predict', 'recommend'] as TaskType[],
  assistant: ['chat', 'agent'] as TaskType[],
  voice: ['voice-stt', 'voice-tts'] as TaskType[],
  system: ['embeddings'] as TaskType[]
};

const CODE_INFO = [
  { code: 429, label: '429 Rate Limited', desc: 'Too many requests', color: 'text-orange-600 bg-orange-50' },
  { code: 401, label: '401 Unauthorized', desc: 'Invalid / expired key', color: 'text-red-600 bg-red-50' },
  { code: 403, label: '403 Forbidden', desc: 'Credits exhausted', color: 'text-red-600 bg-red-50' },
  { code: 500, label: '500 Server Error', desc: 'Provider internal error', color: 'text-amber-600 bg-amber-50' },
  { code: 503, label: '503 Unavailable', desc: 'Service overloaded', color: 'text-amber-600 bg-amber-50' }
];

export default function Advanced() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: s, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: provList = [] } = useQuery({ queryKey: ['providers'], queryFn: providers.list });

  const [form, setForm] = useState<AdvancedSettings | null>(null);
  const [taskConfigs, setTaskConfigs] = useState<Record<string, TaskModelConfig>>({});
  const [activeCategory, setActiveCategory] = useState<keyof typeof TASK_CATEGORIES>('generation');
  const [activeSection, setActiveSection] = useState<string>('tasks');
  
  useEffect(() => {
    if (s) setForm(s);
  }, [s]);

  const saveMutation = useMutation({
    mutationFn: async (body: Partial<AdvancedSettings>) => {
      // DO NOT send taskConfigs in the PUT request — it would clobber the per-task
      // settings just saved via updateTaskConfig, since the form stale copy deep-merges
      // back over any custom settings. Save general settings only.
      const { taskConfigs: _, ...general } = body;
      await settingsApi.update(general);
      // Also save any pending task configs
      if (Object.keys(taskConfigs).length > 0) {
        for (const [taskType, config] of Object.entries(taskConfigs)) {
          await settingsApi.updateTaskConfig(taskType, config);
        }
      }
    },
    onSuccess: async () => {
      toast('success', 'Advanced settings saved.');
      setTaskConfigs({}); // Clear pending changes
      // ✅ Comprehensive query invalidation to ensure settings persist
      await qc.invalidateQueries({ queryKey: ['settings'] });
      await qc.invalidateQueries({ queryKey: ['providers'] });
      await qc.refetchQueries({ queryKey: ['settings'] });
    },
    onError: (e: any) => toast('error', e?.response?.data?.error || 'Save failed')
  });

  if (!form) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-ink-400 mt-3">Loading settings...</p>
        </div>
      </div>
    );
  }

  const toggleCode = (code: number) =>
    setForm((f: any) =>
      f ? { ...f, triggerCodes: f.triggerCodes.includes(code) ? f.triggerCodes.filter((c: number) => c !== code) : [...f.triggerCodes, code] } : f
    );

  const updateTaskConfig = (taskType: TaskType, config: TaskModelConfig) => {
    setTaskConfigs(prev => ({ ...prev, [taskType]: config }));
  };

  const saveTaskConfigs = async () => {
    try {
      for (const [taskType, config] of Object.entries(taskConfigs)) {
        await settingsApi.updateTaskConfig(taskType, config);
      }
      toast('success', 'Task configurations saved.');
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to save task configs');
    }
  };

  const sections = [
    { id: 'tasks', label: 'Task Model Config', icon: Zap },
    { id: 'failback', label: 'Failback & Retry', icon: AlertTriangle },
    { id: 'embeddings', label: 'Embeddings', icon: Database },
    { id: 'retrieval', label: 'Retrieval Settings', icon: Search },
  ];

  return (
    <PageErrorBoundary>
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Advanced Configuration</h1>
          <p className="text-sm text-ink-500 mt-1">Fine-tune failback behavior, per-task models, and embedding source.</p>
        </div>
        <button className="btn-primary" onClick={() => saveMutation.mutate(form)}>
          <Save className="w-4 h-4" /> Save Settings
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 mb-6 bg-ink-100 p-1 rounded-lg overflow-x-auto">
        {sections.map(sec => (
          <button key={sec.id} onClick={() => setActiveSection(sec.id)}
            className={cn('px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 whitespace-nowrap',
              activeSection === sec.id ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'
            )}>
            <sec.icon className="w-4 h-4" /> {sec.label}
          </button>
        ))}
      </div>

      {/* Task Model Configuration */}
      {activeSection === 'tasks' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-ink-800">Task-Specific Model Configuration</h3>
              <p className="text-xs text-ink-500 mt-1">Configure different models for different tasks.</p>
            </div>
            {Object.keys(taskConfigs).length > 0 && (
              <button className="btn-primary text-sm" onClick={saveTaskConfigs}>
                <Save className="w-4 h-4" /> Save Task Configs
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 border-b border-ink-200 overflow-x-auto pb-2">
            {(Object.keys(TASK_CATEGORIES) as Array<keyof typeof TASK_CATEGORIES>).map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-t transition capitalize whitespace-nowrap',
                  activeCategory === cat ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-600' : 'text-ink-600 hover:bg-ink-50'
                )}>
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {TASK_CATEGORIES[activeCategory].map(taskType => {
              const changedConfig = taskConfigs[taskType];
              const savedConfig = s?.taskConfigs?.[taskType];
              const config = changedConfig || savedConfig || { taskType, useDefault: true, fallbackToDefault: true };
              return (
                <TaskModelSelector
                  key={taskType}
                  taskType={taskType}
                  taskLabel={TASK_LABELS[taskType]}
                  config={config}
                  providers={provList}
                  onChange={(newConfig) => updateTaskConfig(taskType, newConfig)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Failback & Retry */}
      {activeSection === 'failback' && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-ink-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Failback & Retry Configuration
            </h3>
            <p className="text-xs text-ink-500 mt-1">Control how the system handles API failures.</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Max retries</label>
              <input type="number" className="input" value={form.maxRetries} min={1} max={10}
                onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Backoff (ms)</label>
              <input type="number" className="input" value={form.backoffMs} min={100} step={100}
                onChange={(e) => setForm({ ...form, backoffMs: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Backoff factor</label>
              <input type="number" className="input" value={form.backoffFactor} min={1} step={0.5}
                onChange={(e) => setForm({ ...form, backoffFactor: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <label className="label">Failback mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(['key-only', 'key-then-provider'] as const).map((m) => (
                <button key={m} onClick={() => setForm({ ...form, failbackMode: m })}
                  className={cn('px-4 py-2.5 rounded-lg border text-sm transition', 
                    form.failbackMode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 hover:bg-ink-50'
                  )}>
                  {m === 'key-only' ? 'Key Only' : 'Key → Provider'}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-400 mt-2">
              <b>Key only</b>: fail over between keys. <b>Key → Provider</b>: also try next provider.
            </p>
          </div>

          <div className="pt-4 border-t border-ink-200">
            <h4 className="font-semibold text-ink-800 mb-3">Trigger codes (fail over on these)</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {CODE_INFO.map((c) => {
                const on = form.triggerCodes.includes(c.code);
                return (
                  <button key={c.code} onClick={() => toggleCode(c.code)}
                    className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition',
                      on ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}>
                    <span className={cn('w-5 h-5 rounded border flex items-center justify-center text-white text-xs',
                      on ? 'bg-brand-600 border-brand-600' : 'border-ink-300')}>
                      {on ? '✓' : ''}
                    </span>
                    <span className="text-sm">
                      <span className="font-medium text-ink-800">{c.label}</span>
                      <span className="block text-xs text-ink-400">{c.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-ink-200">
            <label className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.dynamicModelSwitch}
                onChange={(e) => setForm({ ...form, dynamicModelSwitch: e.target.checked })}
                className="w-4 h-4 accent-purple-600" />
              <div>
                <span className="text-sm font-medium text-ink-800">Dynamic Model Switching</span>
                <p className="text-xs text-ink-500 mt-0.5">
                  Rotate between multiple models per key on rate limits to avoid exhausting quota faster.
                </p>
              </div>
            </label>
          </div>

          {form.dynamicModelSwitch && (
            <div className="pt-4 border-t border-ink-200">
              <h4 className="font-semibold text-ink-800 mb-3">Model Pool (per-provider)</h4>
              <p className="text-xs text-ink-500 mb-3">
                Select which models to include in the dynamic routing pool. Only enabled models appear below. When enabled, the system will rotate through checked models on rate limits before cooling a key.
              </p>

              {provList.length === 0 ? (
                <div className="p-4 text-center bg-ink-50 rounded-lg">
                  <p className="text-sm text-ink-500">No providers configured yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {provList.filter(p => p.enabled).map((p: any) => {
                    const enabledModels = p.models.filter((m: any) => m.enabled);
                    if (enabledModels.length === 0) return null;

                    return (
                      <div key={p.id} className="p-3 bg-ink-50 rounded-lg border border-ink-200">
                        <h5 className="text-sm font-medium text-ink-800 mb-2">{p.name}</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {enabledModels.map((model: any) => {
                            const key = `${p.id}::${model.id}`;
                            const checked = form.dynamicModelPool?.includes(key) || false;
                            return (
                              <label key={model.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const pool = form.dynamicModelPool || [];
                                    if (e.target.checked) {
                                      setForm({ ...form, dynamicModelPool: [...pool, key] });
                                    } else {
                                      setForm({ ...form, dynamicModelPool: pool.filter((k: string) => k !== key) });
                                    }
                                  }}
                                  className="w-4 h-4 accent-purple-600"
                                />
                                <span className="text-xs text-ink-700">{model.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(form.dynamicModelPool || []).length === 0 && (
                <div className="mt-3 p-3 text-xs bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                  ⚠ No models selected. Dynamic routing will be inactive until you check at least one model.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Embeddings */}
      {activeSection === 'embeddings' && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-ink-800 flex items-center gap-2">
              <Database className="w-4 h-4 text-pink-500" />
              Embedding Configuration
            </h3>
            <p className="text-xs text-ink-500 mt-1">Configure how documents are embedded for RAG retrieval.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Embedding provider</label>
              <select className="input" value={form.embeddingProviderId || ''}
                onChange={(e) => setForm({ ...form, embeddingProviderId: e.target.value || undefined })}>
                <option value="">Auto (first OpenAI-compatible)</option>
                {provList.map((p: any) => (
                  <option key={p.id} value={p.id} disabled={p.format !== 'openai'}>
                    {p.name}{p.format !== 'openai' ? ' (no embeddings)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Embedding model</label>
              <input className="input" value={form.embeddingModel}
                onChange={(e) => setForm({ ...form, embeddingModel: e.target.value })} 
                placeholder="text-embedding-3-small" />
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
              <input type="checkbox" checked={form.localEmbeddingFallback}
                onChange={(e) => setForm({ ...form, localEmbeddingFallback: e.target.checked })} 
                className="w-4 h-4 accent-emerald-600" />
              <div>
                <span className="font-medium">Fall back to local embedding model</span>
                <p className="text-xs text-ink-500 mt-0.5">
                  Uses Xenova/all-MiniLM-L6-v2 when provider fails. Enables offline operation.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Retrieval Settings */}
      {activeSection === 'retrieval' && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-ink-800 flex items-center gap-2">
              <Search className="w-4 h-4 text-brand-500" />
              Retrieval & AI Behavior
            </h3>
            <p className="text-xs text-ink-500 mt-1">Fine-tune how the system retrieves and processes information.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-4 bg-ink-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.hybridSearch}
                onChange={(e) => setForm({ ...form, hybridSearch: e.target.checked })} 
                className="w-4 h-4 accent-brand-600" />
              <div>
                <span className="text-sm font-medium text-ink-800">Hybrid Search</span>
                <p className="text-xs text-ink-500">BM25 + vector search fusion</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-ink-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.reranker}
                onChange={(e) => setForm({ ...form, reranker: e.target.checked })} 
                className="w-4 h-4 accent-brand-600" />
              <div>
                <span className="text-sm font-medium text-ink-800">Cross-Encoder Reranker</span>
                <p className="text-xs text-ink-500">Re-rank retrieved chunks</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-ink-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.multiQuery}
                onChange={(e) => setForm({ ...form, multiQuery: e.target.checked })} 
                className="w-4 h-4 accent-brand-600" />
              <div>
                <span className="text-sm font-medium text-ink-800">Multi-Query</span>
                <p className="text-xs text-ink-500">Generate sub-queries for better retrieval</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-ink-50 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.contextCompression}
                onChange={(e) => setForm({ ...form, contextCompression: e.target.checked })} 
                className="w-4 h-4 accent-brand-600" />
              <div>
                <span className="text-sm font-medium text-ink-800">Context Compression</span>
                <p className="text-xs text-ink-500">Summarize long chat history</p>
              </div>
            </label>
          </div>

          {(form.reranker || form.contextCompression) && (
            <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-ink-200">
              {form.reranker && (
                <div>
                  <label className="label">Reranker model</label>
                  <input className="input" value={form.rerankerModel || ''}
                    onChange={(e) => setForm({ ...form, rerankerModel: e.target.value })} />
                </div>
              )}
              {form.contextCompression && (
                <div>
                  <label className="label">Compression tokens</label>
                  <input type="number" className="input" value={form.compressionTokens} min={500} max={8000} step={100}
                    onChange={(e) => setForm({ ...form, compressionTokens: Number(e.target.value) })} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
