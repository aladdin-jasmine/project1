import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Brain, TrendingUp, Target, Flame, Clock, AlertTriangle, BookOpen,
  CheckCircle2, AlertCircle, Gauge, Sparkles, Lightbulb, Star, Zap,
  BarChart3, ArrowRight, Loader2, Circle, BrainCircuit
} from 'lucide-react';
import { advancedAnalytics } from '../api/client';
import { useToast, Badge, Spinner } from '../components/ui';
import { cn } from '../lib/cn';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

function GaugeChart({ value, label, color }: { value: number; label: string; color: string }) {
  const angle = (value / 100) * 180;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full bg-ink-100" />
        <div
          className="absolute inset-0 rounded-t-full transition-all duration-1000"
          style={{
            background: `conic-gradient(${color} ${angle}deg, transparent ${angle}deg)`,
            transform: 'rotate(180deg)',
            transformOrigin: 'bottom center',
          }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-8 rounded-t-full bg-white" />
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-sm font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
      <p className="text-xs text-ink-500 mt-1">{label}</p>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="card p-4 hover:shadow-card-hover transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-sm shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink-900 leading-none">{value}</p>
          <p className="text-xs text-ink-500 mt-0.5">{label}</p>
          {sub && <p className="text-[11px] text-ink-400 mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function ReadinessDonut({ data, total }: { data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).slice(0, 8);
  if (entries.length === 0) return <p className="text-xs text-ink-400 text-center py-4">No readiness data yet.</p>;
  return (
    <div className="space-y-1.5">
      {entries.map(([topic, score]) => (
        <div key={topic}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-ink-600 truncate max-w-[160px] capitalize">{topic}</span>
            <span className="text-ink-400 font-medium">{score}%</span>
          </div>
          <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${score}%`,
                backgroundColor: score >= 70 ? '#059669' : score >= 40 ? '#f59e0b' : '#ef4444'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MemoryDashboard() {
  const nav = useNavigate();
  const toast = useToast();

  const { data: adv, isLoading: advLoading } = useQuery({
    queryKey: ['advanced-analytics'],
    queryFn: advancedAnalytics.get
  });
  const { data: profile } = useQuery({
    queryKey: ['learning-profile'],
    queryFn: advancedAnalytics.profile
  });
  const { data: recs } = useQuery({
    queryKey: ['recommendations'],
    queryFn: advancedAnalytics.recommendations
  });

  const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } }
    }
  };

  const velocityData = adv ? {
    labels: adv.knowledgeGrowth.map((g) => g.date.slice(5)),
    datasets: [{
      label: 'Score', data: adv.knowledgeGrowth.map((g) => g.score),
      borderColor: '#1f41f5', backgroundColor: 'rgba(53,99,255,0.08)',
      fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#1f41f5'
    }, {
      label: 'Velocity', data: adv.knowledgeGrowth.map((g) => Math.max(0, g.velocity * 10)),
      borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)',
      fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#059669', borderDash: [4, 4]
    }]
  } : null;

  const weakData = adv ? {
    labels: adv.weakTopics.slice(0, 8).map((t) => t.topic),
    datasets: [{
      label: 'Weakness %', data: adv.weakTopics.slice(0, 8).map((t) => Math.round(t.weakness * 100)),
      backgroundColor: ['#f87171', '#fb923c', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#f87171'],
      borderRadius: 6
    }]
  } : null;

  const masteredCount = adv?.masteredConcepts?.length || 0;
  const totalConcepts = (adv?.masteredConcepts?.length || 0) + (adv?.strugglingConcepts?.length || 0) + (profile?.weakConcepts?.length || 0);

  const masteryData = adv ? {
    labels: ['Mastered', 'Struggling', 'Weak', 'Unknown'],
    datasets: [{
      data: [
        adv.masteredConcepts.length,
        adv.strugglingConcepts.length,
        adv.weakTopics.length,
        Math.max(0, (profile?.totalConcepts || 1) - (adv.masteredConcepts.length + adv.strugglingConcepts.length + adv.weakTopics.length))
      ],
      backgroundColor: ['#059669', '#f59e0b', '#ef4444', '#d1d5db'],
      borderWidth: 0,
      cutout: '65%'
    }]
  } : null;

  const stressColors = ['bg-emerald-500', 'bg-amber-500', 'bg-red-500'];

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand-500" />
            AI Memory Dashboard
          </h1>
          <p className="text-sm text-ink-500 mt-1">Personalized learning analytics, memory state, and predictive insights.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => nav('/dashboard')}>
          <BarChart3 className="w-4 h-4" /> Main Dashboard
        </button>
      </div>

      {advLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner className="w-8 h-8 text-brand-500" />
        </div>
      ) : !adv || (adv.masteredConcepts.length === 0 && adv.strugglingConcepts.length === 0 && adv.weakTopics.length === 0 && (!profile || profile.totalStudyHours === 0)) ? (
        <div className="card p-12 text-center text-ink-400">
          <Brain className="w-12 h-12 mx-auto mb-3 text-ink-300" />
          <p className="font-medium text-ink-600">No memory data yet.</p>
          <p className="text-sm mt-1">Study with the AI Agent or Chat to build your memory profile.</p>
        </div>
      ) : (
        <>
          {/* Top Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <StatCard icon={<Brain className="w-5 h-5 text-brand-600" />} color="bg-brand-50"
              label="Mastered" value={String(adv.masteredConcepts.length)}
              sub={`of ${adv.strugglingConcepts.length + adv.masteredConcepts.length + adv.weakTopics.length} concepts`} />
            <StatCard icon={<Flame className="w-5 h-5 text-orange-600" />} color="bg-orange-50"
              label="Streak" value={String(profile?.streakDays || 0)} sub="day streak" />
            <StatCard icon={<Clock className="w-5 h-5 text-blue-600" />} color="bg-blue-50"
              label="Study Hours" value={String(profile?.totalStudyHours.toFixed(1) || '0')} sub="total" />
            <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50"
              label="Retention" value={`${adv.retentionRate}%`}
              sub={`${adv.retentionRate >= 70 ? 'Good' : adv.retentionRate >= 40 ? 'Fair' : 'Needs work'}`} />
            <StatCard icon={<Gauge className="w-5 h-5 text-purple-600" />} color="bg-purple-50"
              label="Burnout Risk" value={`${adv.burnoutRisk}%`}
              sub={adv.burnoutRisk > 70 ? 'Take a break!' : adv.burnoutRisk > 40 ? 'Moderate' : 'Low'} />
          </div>

          {/* Burnout gauge + Optimal time + Efficiency */}
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="card p-4 flex flex-col items-center">
              <h3 className="text-xs font-semibold text-ink-600 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Burnout Risk
              </h3>
              <GaugeChart value={adv.burnoutRisk} label="risk level"
                color={adv.burnoutRisk > 70 ? '#ef4444' : adv.burnoutRisk > 40 ? '#f59e0b' : '#059669'} />
              <p className="text-xs text-ink-400 mt-2 text-center">
                {adv.burnoutRisk > 70 ? 'High risk — consider a break' :
                 adv.burnoutRisk > 40 ? 'Moderate — pace yourself' : 'Healthy study pattern'}
              </p>
            </div>
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-ink-600 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" /> Optimal Study Time
              </h3>
              {adv.optimalStudyTime ? (
                <>
                  <div className="text-center py-3">
                    <p className="text-2xl font-bold text-ink-800">
                      {adv.optimalStudyTime.hour.toString().padStart(2, '0')}:00
                    </p>
                    <p className="text-xs text-ink-400 mt-1">
                      {adv.optimalStudyTime.day === 'weekday' ? 'Weekdays' : 'Weekends'} — your peak learning window
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    {[8, 14, 20].map((h) => (
                      <div key={h} className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium',
                        Math.abs(h - adv.optimalStudyTime.hour) <= 2
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-ink-100 text-ink-400'
                      )}>
                        {h}:00
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-ink-400 text-center py-3">Not enough data yet</p>
              )}
            </div>
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-ink-600 mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Learning Efficiency
              </h3>
              <div className="text-center py-3">
                <p className="text-2xl font-bold text-ink-800">{adv.learningEfficiency.toFixed(2)}</p>
                <p className="text-xs text-ink-400">concepts mastered per hour</p>
              </div>
              <div className="mt-2 space-y-1 text-xs text-ink-500">
                {adv.predictionAccuracy !== null && (
                  <div className="flex justify-between">
                    <span>Prediction accuracy</span>
                    <span className="font-medium">{adv.predictionAccuracy}%</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Retention rate</span>
                  <span className="font-medium">{adv.retentionRate}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-500" />
                Knowledge Growth & Velocity
              </h3>
              <div className="h-52">
                {velocityData ? <Line data={velocityData} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, beginAtZero: true } } } as any} /> : null}
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-red-500" />
                Weak Topics & Predicted Difficulty
              </h3>
              <div className="h-52">
                {weakData ? <Bar data={weakData} options={{ ...chartDefaults, indexAxis: 'y' as const } as any} /> : null}
              </div>
            </div>
          </div>

          {/* Concept Mastery + Readiness */}
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-emerald-500" />
                Concept Mastery Distribution
              </h3>
              <div className="flex items-center gap-6">
                <div className="w-32 h-32 shrink-0">
                  {masteryData ? <Doughnut data={masteryData} options={{ cutout: '65%', plugins: { legend: { display: false } } } as any} /> : null}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-ink-600">Mastered: {adv.masteredConcepts.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-ink-600">Struggling: {adv.strugglingConcepts.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-ink-600">Weak: {adv.weakTopics.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                    <span className="text-ink-600">Unknown topics</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-ink-100">
                <h4 className="text-xs font-semibold text-ink-600 mb-2">Mastered Concepts</h4>
                <div className="flex flex-wrap gap-1">
                  {adv.masteredConcepts.slice(0, 12).map((c) => (
                    <Badge key={c.concept} tone="green">{c.concept}</Badge>
                  ))}
                  {adv.masteredConcepts.length > 12 && (
                    <Badge tone="gray">+{adv.masteredConcepts.length - 12} more</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-purple-500" />
                Topic Readiness Scores
              </h3>
              <ReadinessDonut data={adv.readinessScore} total={Object.keys(adv.readinessScore).length} />
              <div className="mt-3 flex gap-2 text-[10px] text-ink-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready (&ge;70)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Review (&ge;40)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Weak (&lt;40)</span>
              </div>
            </div>
          </div>

          {/* Recommendations + Struggling Concepts */}
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                AI Recommendations
              </h3>
              {recs != null && recs.recommendations.length > 0 ? (
                <div className="space-y-2">
                  {recs.recommendations.map((r, i) => (
                    <div key={i} className={cn(
                      'p-3 rounded-lg border text-sm',
                      r.priority === 'high' ? 'bg-red-50 border-red-200' :
                      r.priority === 'medium' ? 'bg-amber-50 border-amber-200' :
                      'bg-brand-50 border-brand-200'
                    )}>
                      <div className="flex items-start gap-2">
                        {r.priority === 'high' ? <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> :
                         r.priority === 'medium' ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> :
                         <Sparkles className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />}
                        <div>
                          <p className="font-medium text-ink-800 text-xs">{r.title}</p>
                          <p className="text-xs text-ink-600 mt-0.5">{r.message}</p>
                          {r.concepts && r.concepts.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {r.concepts.map((c) => <Badge key={c} tone="gray">{c}</Badge>)}
                            </div>
                          )}
                          <p className="text-xs font-medium text-brand-600 mt-1">{r.action}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-400 text-center py-6">No recommendations yet. Start studying to get personalized advice.</p>
              )}
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Struggling Concepts
              </h3>
              {adv.strugglingConcepts.length > 0 ? (
                <div className="space-y-1.5">
                  {adv.strugglingConcepts.slice(0, 10).map((c) => (
                    <div key={c.concept} className="flex items-center justify-between p-2 rounded-lg bg-red-50/50 hover:bg-red-50 transition-colors">
                      <span className="text-xs font-medium text-ink-700 capitalize truncate">{c.concept}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-ink-400">{c.attempts} attempts</span>
                        <span className={cn(
                          'text-xs font-medium px-1.5 py-0.5 rounded',
                          c.successRate < 0.3 ? 'bg-red-100 text-red-700' :
                          c.successRate < 0.5 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        )}>
                          {Math.round(c.successRate * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-400 text-center py-6">No struggling concepts recorded yet.</p>
              )}
            </div>
          </div>

          {/* Recent Mistakes */}
          {profile?.recentMistakes && profile.recentMistakes.length > 0 && (
            <div className="mt-4">
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Recent Mistakes
                </h3>
                <div className="space-y-1.5">
                  {profile.recentMistakes.slice(0, 8).map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-ink-600 p-2 rounded-lg bg-red-50/30">
                      <Circle className="w-2 h-2 text-red-400 mt-1 fill-red-400 shrink-0" />
                      <div>
                        <span className="font-medium text-ink-700 capitalize">{m.concept}</span>
                        <span className="text-ink-500"> — {m.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}