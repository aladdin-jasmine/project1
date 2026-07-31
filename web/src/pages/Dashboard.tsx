import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { 
  Zap, Flame, Target, Activity, AlertTriangle, Server, ArrowRight, 
  BookOpen, GraduationCap, TrendingUp, Brain, Clock, Award, 
  BarChart3, Lightbulb, Sparkles, Loader2, ChevronRight, Star,
  Layers, Bookmark, CheckCircle2, AlertCircle, Gauge
} from 'lucide-react';
import { progress as progressApi, projects, providers, analytics } from '../api/client';
import { useToast, Badge, Spinner } from '../components/ui';
import { cn } from '../lib/cn';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

function StatCard({ icon, label, value, sub, trend, color }: { 
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral'; color: string 
}) {
  return (
    <div className="card p-5 hover:shadow-card-hover transition-all duration-200">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} shadow-sm`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold text-ink-900 leading-none">{value}</p>
          <p className="text-sm text-ink-500 mt-1">{label}</p>
          {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
        </div>
        {trend && (
          <span className={cn(
            'text-xs font-medium px-2 py-1 rounded-full',
            trend === 'up' ? 'bg-emerald-100 text-emerald-700' :
            trend === 'down' ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-600'
          )}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const { data: prog } = useQuery({ queryKey: ['progress'], queryFn: progressApi.get });
  const { data: projList = [] } = useQuery({ queryKey: ['projects'], queryFn: projects.list });
  const { data: provList = [] } = useQuery({ queryKey: ['providers'], queryFn: providers.list });
  const { data: an, isLoading: anLoading } = useQuery({ queryKey: ['analytics'], queryFn: analytics.get });

  const project = projList[0];
  const activeProv = provList.find((p) => p.id === project?.providerId);

  const setDefault = useMutation({
    mutationFn: (body: any) => projects.update(project.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast('success', 'Active model updated.'); },
    onError: (e: any) => toast('error', e?.response?.data?.error || 'Update failed')
  });

  const totalActions = prog ? Object.values(prog.totals).reduce((a, b) => a + b, 0) : 0;
  const weak = prog?.weakTopics?.filter((t) => t.weakness > 0).slice(0, 6) || [];

  const chartDefaults = { 
    responsive: true, maintainAspectRatio: false, 
    plugins: { legend: { display: false } }, 
    scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } } } 
  };

  const activityData = {
    labels: an?.weeklyActivity.map((w) => w.date.slice(5)) ?? [],
    datasets: [{ 
      label: 'Actions', data: an?.weeklyActivity.map((w) => w.actions) ?? [], 
      backgroundColor: 'rgba(53,99,255,0.1)', borderColor: '#1f41f5', 
      fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#1f41f5' 
    }]
  };

  const growthData = {
    labels: an?.knowledgeGrowth.map((g) => g.date.slice(5)) ?? [],
    datasets: [{ 
      label: 'Knowledge score', data: an?.knowledgeGrowth.map((g) => g.score) ?? [], 
      borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)', 
      fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#059669' 
    }]
  };

  const weakData = {
    labels: an?.weakTopics.map((t) => t.topic) ?? [],
    datasets: [{ 
      label: 'Weakness %', data: an?.weakTopics.map((t) => Math.round(t.weakness * 100)) ?? [], 
      backgroundColor: ['#f87171', '#fb923c', '#fbbf24', '#a78bfa', '#f472b6', '#34d399'],
      borderRadius: 6
    }]
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">Your learning momentum at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={() => nav('/studio')}>
            <GraduationCap className="w-4 h-4" /> Go to Studio
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<Zap className="w-6 h-6 text-brand-600" />} 
          color="bg-brand-50" 
          label="Total XP" 
          value={String(prog?.xp || 0)} 
          sub="Keep studying to level up"
          trend="up"
        />
        <StatCard 
          icon={<Flame className="w-6 h-6 text-orange-600" />} 
          color="bg-orange-50" 
          label="Day Streak" 
          value={String(prog?.streak || 0)} 
          sub="Daily consistency"
        />
        <StatCard 
          icon={<Brain className="w-6 h-6 text-emerald-600" />} 
          color="bg-emerald-50" 
          label="Mastery" 
          value={`${Math.round((prog?.mastery || 0) * 100)}%`} 
          sub="Correct vs incorrect"
          trend={prog?.mastery && prog.mastery >= 0.7 ? 'up' : 'down'}
        />
        <StatCard 
          icon={<BarChart3 className="w-6 h-6 text-violet-600" />} 
          color="bg-violet-50" 
          label="Study Actions" 
          value={String(totalActions)} 
          sub="Slides, quizzes, chats"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        {/* Active Configuration */}
        <div className="card p-5 lg:col-span-1">
          <h3 className="font-semibold text-ink-800 flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-brand-500" /> 
            Active Configuration
          </h3>
          {activeProv ? (
            <div className="space-y-4">
              <div className="p-3 bg-gradient-to-r from-brand-50 to-purple-50 rounded-lg border border-brand-200/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center text-sm font-bold">
                    {activeProv.name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-ink-800 text-sm">{activeProv.name}</p>
                    <p className="text-xs text-ink-500">{activeProv.format === 'openai' ? 'OpenAI-compatible' : 'Anthropic-compatible'}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="label text-xs">Provider</label>
                <select className="input text-sm" value={activeProv.id} 
                  onChange={(e) => setDefault.mutate({ providerId: e.target.value, defaultModel: provList.find((p) => p.id === e.target.value)?.defaultModel })}>
                  {provList.map((p) => <option key={p.id} value={p.id} disabled={!p.enabled}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Model</label>
                <select className="input text-sm" value={project?.defaultModel || activeProv.defaultModel || ''} 
                  onChange={(e) => setDefault.mutate({ defaultModel: e.target.value })}>
                  {activeProv.models.length > 0 
                    ? activeProv.models.filter(m => m.enabled).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))
                    : activeProv.defaultModel && <option value={activeProv.defaultModel}>{activeProv.defaultModel}</option>
                  }
                </select>
              </div>
              <button className="btn-ghost text-xs text-brand-600 w-full" onClick={() => nav('/providers')}>
                Manage providers →
              </button>
            </div>
          ) : (
            <div className="text-sm text-ink-400">
              No provider set. <button className="text-brand-600 underline" onClick={() => nav('/providers')}>Add one</button>.
            </div>
          )}
        </div>

        {/* Weak-Spot Analyzer */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-ink-800 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-500" /> 
            Weak-Spot Analyzer
            <span className="text-xs text-ink-400 font-normal ml-auto">
              {weak.length} weak {weak.length === 1 ? 'area' : 'areas'}
            </span>
          </h3>
          {weak.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-ink-400">
              <div className="text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p>Complete quizzes or flashcards to reveal weak spots.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {weak.map((t) => (
                <div key={t.topic}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-ink-700 capitalize flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      {t.topic}
                    </span>
                    <span className="text-ink-400 text-xs">{Math.round(t.weakness * 100)}% missed</span>
                  </div>
                  <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.round(t.weakness * 100)}%` }} 
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-ink-400 mt-3 flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Focus next on: <b className="text-ink-700">{weak.slice(0, 3).map((w) => w.topic).join(', ')}</b>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <h3 className="section-title mt-8 mb-4">
        <TrendingUp className="w-5 h-5 text-brand-500" />
        Insights
      </h3>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="card p-5">
          <h4 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-500" />
            Weekly Activity
          </h4>
          <div className="h-56"><Line data={activityData} options={chartDefaults as any} /></div>
        </div>
        <div className="card p-5">
          <h4 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-emerald-500" />
            Knowledge Growth
          </h4>
          <div className="h-56"><Line data={growthData} options={chartDefaults as any} /></div>
        </div>
        <div className="card p-5">
          <h4 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Weak Topics
          </h4>
          <div className="h-56"><Bar data={weakData} options={{ ...chartDefaults, indexAxis: 'y' as const } as any} /></div>
        </div>
      </div>

      {/* Quick Actions */}
      <h3 className="section-title mt-8 mb-4">
        <Zap className="w-5 h-5 text-amber-500" />
        Quick Actions
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button className="card-hover p-5 text-left transition-all group" onClick={() => nav('/studio')}>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all">
            <GraduationCap className="w-6 h-6" />
          </div>
          <p className="font-semibold text-ink-800">Study Studio</p>
          <p className="text-xs text-ink-400 mt-1">Generate slides, flashcards, quizzes & more</p>
        </button>
        <button className="card-hover p-5 text-left transition-all group" onClick={() => nav('/knowledge')}>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="font-semibold text-ink-800">Knowledge Base</p>
          <p className="text-xs text-ink-400 mt-1">Upload documents to study from</p>
        </button>
        <button className="card-hover p-5 text-left transition-all group" onClick={() => nav('/notes')}>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all">
            <Bookmark className="w-6 h-6" />
          </div>
          <p className="font-semibold text-ink-800">Smart Notes</p>
          <p className="text-xs text-ink-400 mt-1">Generate revision notes and summaries</p>
        </button>
        <button className="card-hover p-5 text-left transition-all group" onClick={() => nav('/providers')}>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center mb-3 shadow-sm group-hover:shadow-md transition-all">
            <Server className="w-6 h-6" />
          </div>
          <p className="font-semibold text-ink-800">Configure AI</p>
          <p className="text-xs text-ink-400 mt-1">Manage LLM providers and models</p>
        </button>
      </div>
    </div>
  );
}
