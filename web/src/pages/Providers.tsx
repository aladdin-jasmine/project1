import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Pencil, Trash2, Power, Activity, RefreshCw, Star, KeyRound, 
  Server, Globe, Loader2, CheckCircle2, XCircle, AlertCircle, 
  Search, Settings2, GripVertical, Eye, EyeOff, Sparkles, Brain,
  Image, Mic, Volume2, Database, ChevronDown, ChevronRight
} from 'lucide-react';
import { providers, projects, type Provider, type Project, type ModelInfo, type ModelCapability } from '../api/client';
import { useToast, Badge, Modal, Spinner, EmptyState } from '../components/ui';
import ProviderModal from '../components/ProviderModal';
import { cn } from '../lib/cn';

const CAP_ICONS: Record<ModelCapability, { icon: any; label: string; color: string }> = {
  text: { icon: Sparkles, label: 'Text', color: 'bg-blue-100 text-blue-700' },
  vision: { icon: Image, label: 'Vision', color: 'bg-purple-100 text-purple-700' },
  reasoning: { icon: Brain, label: 'Reasoning', color: 'bg-amber-100 text-amber-700' },
  'voice-stt': { icon: Mic, label: 'STT', color: 'bg-green-100 text-green-700' },
  'voice-tts': { icon: Volume2, label: 'TTS', color: 'bg-teal-100 text-teal-700' },
  embeddings: { icon: Database, label: 'Embeddings', color: 'bg-pink-100 text-pink-700' }
};

function StatusIndicator({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={cn(
        'w-2 h-2 rounded-full',
        status === 'online' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' :
        status === 'offline' ? 'bg-red-500' : 'bg-ink-300'
      )} />
      <span className={cn(
        'font-medium',
        status === 'online' ? 'text-emerald-600' :
        status === 'offline' ? 'text-red-500' : 'text-ink-400'
      )}>
        {status === 'online' ? 'Connected' : status === 'offline' ? 'Error' : 'Unknown'}
      </span>
    </span>
  );
}

export default function Providers() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: list = [], isLoading } = useQuery({ queryKey: ['providers'], queryFn: providers.list });
  const { data: projList = [] } = useQuery({ queryKey: ['projects'], queryFn: projects.list });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [confirmDel, setConfirmDel] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['providers'] });

  const filteredList = list.filter(p => {
    if (activeFilter === 'enabled' && !p.enabled) return false;
    if (activeFilter === 'disabled' && p.enabled) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return p.name.toLowerCase().includes(term) || 
             p.baseUrl.toLowerCase().includes(term) ||
             p.format.toLowerCase().includes(term) ||
             p.models.some((m: ModelInfo) => m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term));
    }
    return true;
  });

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (p: Provider) => {
    const full = await providers.get(p.id, true);
    setEditing(full);
    setModalOpen(true);
  };

  const del = useMutation({
    mutationFn: (id: string) => providers.remove(id),
    onSuccess: () => { toast('success', 'Provider deleted.'); invalidate(); setConfirmDel(null); },
    onError: (e: any) => toast('error', e?.response?.data?.error || 'Delete failed')
  });

  const toggle = useMutation({
    mutationFn: (p: Provider) => providers.toggle(p.id, !p.enabled),
    onSuccess: invalidate
  });

  const testProviderFn = async (p: Provider) => {
    setBusy(b => ({ ...b, [`test-${p.id}`]: 'testing' }));
    try {
      const r = await providers.test(p.id);
      if (r.ok) toast('success', `Connected (${r.model})`);
      else toast('error', `Test failed: ${r.error}`);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Test failed');
    } finally {
      setBusy(b => { const n = { ...b }; delete n[`test-${p.id}`]; return n; });
    }
  };

  const loadModels = async (p: Provider) => {
    setBusy(b => ({ ...b, [`models-${p.id}`]: 'loading' }));
    try {
      const r = await providers.models(p.id);
      toast('success', `Loaded ${r.models.length} models from ${r.provider.name}.`);
      // Force refresh the provider list to show loaded models
      await invalidate();
      // Auto-expand the models section so user can see the loaded models
      setExpandedId(p.id);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.error || 'Failed to load models';
      toast('error', errorMsg);
      // If load fails, show manual entry option
      if (errorMsg.includes('Could not list models')) {
        setExpandedId(p.id);
        toast('info', 'Try adding models manually below.');
      }
    } finally {
      setBusy(b => { const n = { ...b }; delete n[`models-${p.id}`]; return n; });
    }
  };

  const makeDefault = async (p: Provider) => {
    const proj = projList[0] as Project | undefined;
    if (!proj) return;
    const firstModel = p.models.length > 0 ? p.models[0].id : undefined;
    await projects.update(proj.id, { providerId: p.id, defaultModel: p.defaultModel || firstModel });
    qc.invalidateQueries({ queryKey: ['projects'] });
    toast('success', `Set "${p.name}" as default for ${proj.name}.`);
  };

  const isDefault = (p: Provider) => projList[0]?.providerId === p.id;

  const toggleModel = async (providerId: string, modelId: string, enabled: boolean) => {
    try {
      await providers.toggleModel(providerId, modelId, enabled);
      toast('success', `Model ${enabled ? 'enabled' : 'disabled'}.`);
      invalidate();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to toggle model');
    }
  };

  const setDefaultModel = async (providerId: string, modelId: string) => {
    try {
      await providers.update(providerId, { defaultModel: modelId });
      toast('success', 'Default model updated.');
      invalidate();
      const provider = list.find(p => p.id === providerId);
      if (provider && isDefault(provider)) {
        const proj = projList[0] as Project | undefined;
        if (proj) {
          await projects.update(proj.id, { defaultModel: modelId });
          qc.invalidateQueries({ queryKey: ['projects'] });
        }
      }
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to set default model');
    }
  };

  const addManualModel = async (providerId: string, modelId: string) => {
    try {
      await providers.addModel(providerId, modelId);
      toast('success', `Model "${modelId}" added.`);
      invalidate();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to add model');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">LLM Providers</h1>
          <p className="text-sm text-ink-500 mt-1">
            Manage your AI providers, models, and API keys. Configure failback and load balancing.
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            className="input pl-9 pr-8"
            placeholder="Search providers and models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-ink-100 rounded">
              <XCircle className="w-4 h-4 text-ink-400" />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-ink-100 p-1 rounded-lg">
          {(['all', 'enabled', 'disabled'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium capitalize transition',
                activeFilter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'
              )}>
              {f} {f === 'all' && `(${list.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Provider Cards */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sm text-ink-400">Loading providers...</p>
          </div>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="card p-12">
          <EmptyState
            icon={<Server className="w-8 h-8" />}
            title={searchTerm ? "No providers match your search" : "No providers configured"}
            hint={searchTerm ? "Try a different search term" : "Add a provider to start generating study materials."}
            action={
              <button className="btn-primary" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add your first provider
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((p) => {
            const expanded = expandedId === p.id;
            const status = p.models.length > 0 ? 'online' : 'unknown';
            return (
              <div key={p.id} className={cn(
                "card overflow-hidden transition-all duration-200",
                !p.enabled && "opacity-75"
              )}>
                {/* Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm',
                        p.enabled ? 'bg-gradient-to-br from-brand-500 to-purple-600 text-white' : 'bg-ink-100 text-ink-400'
                      )}>
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5 mb-1">
                          <h3 className="font-semibold text-ink-900">{p.name}</h3>
                          {isDefault(p) && (
                            <span className="badge-brand text-[10px]">Default</span>
                          )}
                          <Badge tone={p.enabled ? 'green' : 'gray'}>
                            {p.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-ink-500">
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {p.format === 'openai' ? 'OpenAI-compatible' : 'Anthropic-compatible'}
                          </span>
                          <StatusIndicator status={status} />
                          <span className="flex items-center gap-1">
                            <KeyRound className="w-3 h-3" />
                            {p.keys.length} key{p.keys.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button className={cn(
                        "btn !py-2 !px-3 text-xs",
                        p.enabled ? 'btn-soft' : 'btn-outline'
                      )} onClick={() => toggle.mutate(p)}>
                        <Power className={cn('w-3.5 h-3.5', p.enabled ? 'text-emerald-600' : 'text-ink-400')} />
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-ink-400 mt-3 font-mono">{p.baseUrl}</p>

                  <div className="flex items-center gap-3 mt-2 text-xs text-ink-500">
                    {p.models.length > 0 && (
                      <span>{p.models.length} model{p.models.length > 1 ? 's' : ''}</span>
                    )}
                    {p.defaultModel && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500" />
                        Default: {p.defaultModel}
                      </span>
                    )}
                    {p.priority > 0 && (
                      <span>Priority: {p.priority}</span>
                    )}
                  </div>

                  {/* Quick Stats */}
                  {p.models.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {p.models.filter(m => m.enabled).slice(0, 8).map(m => (
                        <span key={m.id} className="text-[10px] px-2 py-0.5 bg-ink-50 text-ink-600 rounded-md border border-ink-200/50">
                          {m.name}
                        </span>
                      ))}
                      {p.models.filter(m => m.enabled).length > 8 && (
                        <span className="text-[10px] px-2 py-0.5 text-brand-600 rounded-md">
                          +{p.models.filter(m => m.enabled).length - 8} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Bar */}
                <div className="px-5 py-3 bg-ink-50/50 border-t border-ink-200/60 flex items-center gap-2 flex-wrap">
                  <button className="btn-outline !py-1.5 !px-3 text-xs" onClick={() => testProviderFn(p)} disabled={!!busy[`test-${p.id}`]}>
                    {busy[`test-${p.id}`] === 'testing' ? <Spinner className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />} Test
                  </button>
                  <button className="btn-outline !py-1.5 !px-3 text-xs" onClick={() => loadModels(p)} disabled={!!busy[`models-${p.id}`]}>
                    {busy[`models-${p.id}`] === 'loading' ? <Spinner className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />} Load Models
                  </button>
                  <button
                    className={cn('!py-1.5 !px-3 text-xs', isDefault(p) ? 'btn-soft' : 'btn-outline')}
                    onClick={() => makeDefault(p)}
                    disabled={isDefault(p)}
                  >
                    <Star className={cn('w-3.5 h-3.5', isDefault(p) && 'fill-current')} />
                    {isDefault(p) ? 'Default' : 'Set Default'}
                  </button>
                  <button className="btn-outline !py-1.5 !px-3 text-xs" onClick={() => setExpandedId(expanded ? null : p.id)}>
                    <Settings2 className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
                    Models
                  </button>
                  <div className="flex-1" />
                  <button className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => openEdit(p)}>
                    <Pencil className="w-4 h-4 text-ink-500" />
                  </button>
                  <button className="btn-ghost !py-1.5 !px-2 text-xs" onClick={() => setConfirmDel(p)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                {/* Expanded Models Section */}
                {expanded && (
                  <div className="px-5 py-4 border-t border-ink-200/60 bg-gradient-to-b from-ink-50/30 to-white">
                    <ModelsManager
                      models={p.models}
                      providerId={p.id}
                      defaultModel={p.defaultModel}
                      onToggle={(modelId, enabled) => toggleModel(p.id, modelId, enabled)}
                      onSetDefault={(modelId) => setDefaultModel(p.id, modelId)}
                      onAddManual={(modelId) => addManualModel(p.id, modelId)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProviderModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        initial={editing} 
        onSaved={invalidate} 
      />

      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete provider?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setConfirmDel(null)}>Cancel</button>
            <button className="btn-danger" onClick={() => confirmDel && del.mutate(confirmDel.id)}>
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Remove <b>{confirmDel?.name}</b>? This also removes its cached models and failback keys.
        </p>
      </Modal>
    </div>
  );
}

function ModelsManager({
  models,
  providerId,
  defaultModel,
  onToggle,
  onSetDefault,
  onAddManual
}: {
  models: ModelInfo[];
  providerId: string;
  defaultModel?: string;
  onToggle: (modelId: string, enabled: boolean) => void;
  onSetDefault: (modelId: string) => void;
  onAddManual: (modelId: string) => void;
}) {
  const [modelSearch, setModelSearch] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');

  const filtered = modelSearch
    ? models.filter(m =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.name.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models;

  const handleManualAdd = () => {
    if (manualId.trim()) {
      onAddManual(manualId.trim());
      setManualId('');
      setShowManual(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-ink-800">
          Models ({models.length})
        </h4>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              type="text"
              className="input !py-1.5 !pl-8 !pr-3 text-xs w-48"
              placeholder="Search models..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowManual(!showManual)}
            className="btn-soft !py-1.5 !px-2.5 text-xs"
          >
            {showManual ? 'Cancel' : '+ Add Manual'}
          </button>
        </div>
      </div>

      {showManual && (
        <div className="mb-3 p-3 bg-brand-50 border border-brand-200/60 rounded-lg space-y-2">
          <label className="text-xs font-medium text-ink-700">Add Model Manually</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm flex-1"
              placeholder="e.g., gpt-4o-mini, llama-3.1-70b-versatile"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleManualAdd(); } }}
            />
            <button onClick={handleManualAdd} disabled={!manualId.trim()} className="btn-primary text-xs">Add</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && modelSearch && (
        <p className="text-xs text-amber-600 py-2">No models match "{modelSearch}"</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((model) => (
          <div
            key={model.id}
            className={cn(
              'rounded-lg border p-3 transition-all',
              model.enabled ? 'border-ink-200 bg-white hover:border-brand-300' : 'border-ink-100 bg-ink-50/50 opacity-60'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-medium text-ink-900 truncate">{model.name}</p>
                  {model.metadata?.speed && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      model.metadata.speed === 'fast' ? 'bg-emerald-100 text-emerald-700' :
                      model.metadata.speed === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-600'
                    )}>
                      {model.metadata.speed}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 mb-1.5">
                  {model.capabilities.map((cap) => {
                    const info = CAP_ICONS[cap];
                    if (!info) return null;
                    const Icon = info.icon;
                    return (
                      <span key={cap} className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        info.color
                      )}>
                        <Icon className="w-3 h-3" />
                        {info.label}
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 text-[10px] text-ink-500">
                  {model.contextWindow > 0 && (
                    <span title="Context">{model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow} ctx</span>
                  )}
                  {model.maxTokens > 0 && (
                    <span title="Max tokens">{model.maxTokens >= 1000 ? `${(model.maxTokens / 1000).toFixed(0)}K` : model.maxTokens} out</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onToggle(model.id, !model.enabled)}
                  className={cn('p-1.5 rounded hover:bg-ink-100 transition', model.enabled ? 'text-green-600' : 'text-ink-400')}
                  title={model.enabled ? 'Disable' : 'Enable'}
                >
                  {model.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onSetDefault(model.id)}
                  disabled={model.id === defaultModel}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded transition',
                    model.id === defaultModel
                      ? 'text-brand-700 bg-brand-100 cursor-default'
                      : 'text-brand-600 hover:bg-brand-50'
                  )}
                  title={model.id === defaultModel ? 'Already default' : 'Set as default'}
                >
                  {model.id === defaultModel ? '★ Default' : 'Default'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
