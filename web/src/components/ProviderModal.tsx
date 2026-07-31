import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, Search, X, Eye, EyeOff, Sparkles, Brain, Image, Mic, Volume2, Database, Loader2 } from 'lucide-react';
import { Modal, Badge } from './ui';
import { providers, type Provider, type ModelInfo, type ModelCapability } from '../api/client';
import { useToast } from './ui';
import { cn } from '../lib/cn';

interface KeyRow {
  id?: string;
  label: string;
  key: string;
  enabled?: boolean;
}

const CAP_ICONS: Record<ModelCapability, { icon: any; label: string; color: string }> = {
  text: { icon: Sparkles, label: 'Text', color: 'bg-blue-100 text-blue-700' },
  vision: { icon: Image, label: 'Vision', color: 'bg-purple-100 text-purple-700' },
  reasoning: { icon: Brain, label: 'Reasoning', color: 'bg-amber-100 text-amber-700' },
  'voice-stt': { icon: Mic, label: 'STT', color: 'bg-green-100 text-green-700' },
  'voice-tts': { icon: Volume2, label: 'TTS', color: 'bg-teal-100 text-teal-700' },
  embeddings: { icon: Database, label: 'Embeddings', color: 'bg-pink-100 text-pink-700' }
};

export default function ProviderModal({
  open,
  onClose,
  initial,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  initial?: Provider | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'openai' | 'anthropic'>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [keys, setKeys] = useState<KeyRow[]>([{ label: 'primary', key: '' }]);
  const [defaultModel, setDefaultModel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadedModels, setLoadedModels] = useState<ModelInfo[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualModelId, setManualModelId] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setFormat(initial.format);
      setBaseUrl(initial.baseUrl);
      setKeys(initial.keys.map((k) => ({ id: k.id, label: k.label, key: k.key, enabled: k.enabled })));
      setDefaultModel(initial.defaultModel || '');
      setEnabled(initial.enabled);
      setLoadedModels(initial.models || []);
    } else {
      setName('');
      setFormat('openai');
      setBaseUrl('');
      setKeys([{ label: 'primary', key: '' }]);
      setDefaultModel('');
      setEnabled(true);
      setLoadedModels([]);
    }
    setModelSearch('');
    setShowManualEntry(false);
    setManualModelId('');
  }, [open, initial]);

  const addKey = () => setKeys((k) => [...k, { label: `failback-${k.length}`, key: '' }]);
  const updateKey = (i: number, patch: Partial<KeyRow>) =>
    setKeys((k) => k.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeKey = (i: number) => setKeys((k) => (k.length > 1 ? k.filter((_, idx) => idx !== i) : k));

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return loadedModels;
    const term = modelSearch.toLowerCase();
    return loadedModels.filter(m => 
      m.id.toLowerCase().includes(term) ||
      m.name.toLowerCase().includes(term) ||
      m.capabilities.some(c => c.toLowerCase().includes(term)) ||
      m.metadata?.vendor?.toLowerCase().includes(term)
    );
  }, [loadedModels, modelSearch]);

  const loadModels = async () => {
    if (!name.trim() || !baseUrl.trim() || keys.some((k) => !k.key.trim())) {
      toast('error', 'Fill in Name, Base URL, and API keys before loading models.');
      return;
    }
    setLoadingModels(true);
    try {
      let providerId = initial?.id;
      if (!providerId) {
        const body = { name, format, baseUrl, keys, defaultModel: defaultModel || undefined, enabled: false };
        const created = await providers.create(body);
        providerId = created.id;
        setName(created.name);
      }
      const result = await providers.models(providerId);
      setLoadedModels(result.models);
      toast('success', `Loaded ${result.models.length} models.`);
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to load models');
    } finally {
      setLoadingModels(false);
    }
  };

  const submit = async () => {
    if (!name.trim() || !baseUrl.trim() || keys.some((k) => !k.key.trim())) {
      toast('error', 'Name, Base URL, and all API keys are required.');
      return;
    }
    setSaving(true);
    try {
      const body = { name, format, baseUrl, keys, defaultModel: defaultModel || undefined, enabled };
      if (initial) await providers.update(initial.id, body);
      else await providers.create(body);
      
      // ✅ CRITICAL FIX: Invalidate queries to ensure changes persist across reloads
      await qc.invalidateQueries({ queryKey: ['providers'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      await qc.invalidateQueries({ queryKey: ['models'] });
      // Force immediate refetch to update UI
      await qc.refetchQueries({ queryKey: ['providers'] });
      
      toast('success', `Provider ${initial ? 'updated' : 'created'}.`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || e.message || 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const handleAddManualModel = () => {
    if (manualModelId.trim()) {
      const newModel: ModelInfo = {
        id: manualModelId.trim(),
        name: manualModelId.trim(),
        capabilities: ['text'],
        contextWindow: 8192,
        maxTokens: 4096,
        enabled: true,
        metadata: { speed: 'medium', quality: 'medium', vendor: 'Custom', description: 'Manually added' }
      };
      setLoadedModels(prev => [...prev, newModel]);
      if (!defaultModel) setDefaultModel(manualModelId.trim());
      setManualModelId('');
      setShowManualEntry(false);
      toast('success', `Model "${manualModelId.trim()}" added.`);
    }
  };

  const toggleModelLocal = (modelId: string, enabled: boolean) => {
    setLoadedModels(models => models.map(m => m.id === modelId ? { ...m, enabled } : m));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg',
            initial ? 'bg-gradient-to-br from-brand-500 to-purple-600 text-white' : 'bg-ink-100 text-ink-500'
          )}>
            {initial ? initial.name[0].toUpperCase() : '+'}
          </div>
          <div>
            <p className="text-lg font-semibold text-ink-900">{initial ? 'Edit Provider' : 'Add Custom Provider'}</p>
            <p className="text-xs text-ink-500">{initial ? 'Modify provider configuration' : 'Connect a new LLM provider'}</p>
          </div>
        </div>
      }
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <button 
            type="button"
            className="btn-outline !py-1.5 !px-3 text-xs"
            onClick={loadModels}
            disabled={loadingModels}
          >
            {loadingModels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Load Models
          </button>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Provider Name */}
        <div>
          <label className="label">Provider name</label>
          <input className="input" placeholder="e.g. my-llm-server" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* API Format */}
        <div>
          <label className="label">API format</label>
          <div className="grid grid-cols-2 gap-2">
            {(['openai', 'anthropic'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  'px-4 py-2.5 rounded-lg border text-sm font-medium capitalize transition',
                  format === f 
                    ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' 
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                )}
              >
                {f === 'openai' ? 'OpenAI-compatible' : 'Anthropic-compatible'}
              </button>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="label">Base URL</label>
          <input className="input" placeholder="https://your-endpoint/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>

        {/* API Keys */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">API keys</label>
            <button type="button" className="text-xs text-brand-600 hover:underline flex items-center gap-1" onClick={addKey}>
              <Plus className="w-3.5 h-3.5" /> Add failback key
            </button>
          </div>
          <p className="text-xs text-ink-400 mb-2">
            First key is primary. Extra keys act as failback when rate-limited or credits exhausted.
          </p>
          <div className="space-y-2">
            {keys.map((k, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="input !w-28 shrink-0 text-xs"
                  placeholder="label"
                  value={k.label}
                  onChange={(e) => updateKey(i, { label: e.target.value })}
                />
                <div className="relative flex-1">
                  <input
                    className="input w-full pr-8 text-sm font-mono"
                    type="password"
                    placeholder="Paste your API key"
                    value={k.key}
                    onChange={(e) => updateKey(i, { key: e.target.value })}
                  />
                </div>
                <button
                  onClick={() => updateKey(i, { enabled: !(k.enabled ?? true) })}
                  className={cn('p-1.5 rounded hover:bg-ink-100', (k.enabled ?? true) ? 'text-green-600' : 'text-ink-400')}
                >
                  {(k.enabled ?? true) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                {keys.length > 1 && (
                  <button className="text-ink-400 hover:text-red-500 p-1" onClick={() => removeKey(i)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Default Model */}
        <div>
          <label className="label">Default model (optional)</label>
          <input
            className="input"
            placeholder="Leave blank to pick after loading models"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
          />
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-brand-600" />
          Enable provider
        </label>

        {/* Models Section */}
        <div className="pt-4 border-t border-ink-200">
          <div className="flex items-center justify-between mb-3">
            <label className="label mb-0">Available Models ({loadedModels.length})</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualEntry(!showManualEntry)}
                className="text-xs text-brand-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Manual
              </button>
            </div>
          </div>

          {/* Manual Entry */}
          {showManualEntry && (
            <div className="mb-3 p-3 bg-brand-50 border border-brand-200 rounded-lg space-y-2">
              <input
                type="text"
                className="input text-sm"
                placeholder="Enter model ID (e.g., gpt-4o, llama-3.1-70b)"
                value={manualModelId}
                onChange={(e) => setManualModelId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualModel(); } }}
              />
              <button onClick={handleAddManualModel} disabled={!manualModelId.trim()} className="btn-primary text-xs">
                Add Model
              </button>
            </div>
          )}

          {/* Search */}
          {loadedModels.length > 5 && (
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="text"
                className="input text-sm pl-9 pr-8"
                placeholder="Search models..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
              {modelSearch && (
                <button onClick={() => setModelSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-ink-400" />
                </button>
              )}
            </div>
          )}

          {/* Models Grid */}
          {filteredModels.length === 0 && modelSearch && (
            <p className="text-xs text-amber-600 py-2">No models match "{modelSearch}"</p>
          )}

          {loadedModels.length === 0 && !modelSearch ? (
            <p className="text-xs text-ink-400 italic py-2">
              No models loaded yet. Click "Load Models" to fetch available models from this provider.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
              {filteredModels.map((model) => (
                <div
                  key={model.id}
                  className={cn(
                    'rounded-lg border p-3 transition',
                    model.enabled ? 'border-ink-200 bg-white' : 'border-ink-100 bg-ink-50 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-ink-900 truncate">{model.name}</p>
                        {model.metadata?.speed && (
                          <Badge tone={model.metadata.speed === 'fast' ? 'green' : model.metadata.speed === 'medium' ? 'amber' : 'gray'}>
                            {model.metadata.speed}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {model.capabilities.map((cap) => {
                          const info = CAP_ICONS[cap];
                          if (!info) return null;
                          const Icon = info.icon;
                          return (
                            <span key={cap} className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', info.color)}>
                              <Icon className="w-3 h-3" /> {info.label}
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-ink-500">
                        {model.contextWindow > 0 && <span>{model.contextWindow >= 1000 ? `${(model.contextWindow / 1000).toFixed(0)}K` : model.contextWindow} ctx</span>}
                        {model.maxTokens > 0 && <span>{model.maxTokens >= 1000 ? `${(model.maxTokens / 1000).toFixed(0)}K` : model.maxTokens} out</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleModelLocal(model.id, !model.enabled)}
                        className={cn('p-1.5 rounded hover:bg-ink-100', model.enabled ? 'text-green-600' : 'text-ink-400')}>
                        {model.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setDefaultModel(model.id)}
                        className="px-2 py-1 text-[10px] font-medium text-brand-600 hover:bg-brand-50 rounded">
                        Default
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
