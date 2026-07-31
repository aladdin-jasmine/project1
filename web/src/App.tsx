import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, SlidersHorizontal, BookOpen, GraduationCap, 
  StickyNote, Shield, Sparkles, Zap, Brain, ChevronDown, BrainCircuit, History
} from 'lucide-react';
import { ToastProvider } from './components/ui';
import Dashboard from './pages/Dashboard';
import Providers from './pages/Providers';
import Advanced from './pages/Advanced';
import KnowledgeBase from './pages/KnowledgeBase';
import StudyStudio from './pages/StudyStudio';
import StudioFeaturePage from './pages/StudioFeaturePage';
import StudioHistory from './pages/StudioHistory';
import Notes from './pages/Notes';
import NotesDetailPage from './pages/NotesDetailPage';
import Admin from './pages/Admin';
import MemoryDashboard from './pages/MemoryDashboard';
import ChatView from './features/study/ChatView';
import AgentView from './features/study/AgentView';
import VoiceTutor from './features/study/VoiceTutor';
import { useParams } from 'react-router-dom';

function ChatViewPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatView source={{ type: 'multi' }} initialSessionId={id} />;
}

import { cn } from './lib/cn';
import { useState } from 'react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Overview & analytics', end: true },
  { to: '/providers', label: 'Providers', icon: Server, desc: 'LLM model management' },
  { to: '/advanced', label: 'Advanced', icon: SlidersHorizontal, desc: 'System configuration' },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen, desc: 'Documents & RAG' },
  { to: '/memory', label: 'AI Memory', icon: BrainCircuit, desc: 'Learning analytics & memory' },
  { to: '/notes', label: 'Notes', icon: StickyNote, desc: 'Smart notes & revision' },
  { to: '/studio', label: 'Study Studio', icon: GraduationCap, desc: 'Generate study materials' },
  { to: '/admin', label: 'Admin', icon: Shield, desc: 'System administration' }
];

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn(
      "shrink-0 bg-white border-r border-ink-200/60 flex flex-col transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className={cn(
        "h-16 flex items-center border-b border-ink-200/60 transition-all",
        collapsed ? "justify-center px-0" : "gap-3 px-5"
      )}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shrink-0">
          <Zap className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-ink-900 leading-tight text-sm">StudyForge</p>
            <p className="text-[10px] text-ink-400 truncate">AI Study Assistant</p>
          </div>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group',
                collapsed ? 'justify-center' : '',
                isActive 
                  ? 'bg-gradient-to-r from-brand-50 to-purple-50/50 text-brand-700 border border-brand-200/50' 
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800'
              )
            }
            title={n.label}
          >
            <n.icon className={cn("w-5 h-5 shrink-0", collapsed ? "" : "")} />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <span className="block truncate">{n.label}</span>
                <span className="block text-[10px] text-ink-400 font-normal truncate">{n.desc}</span>
              </div>
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-ink-900 text-white text-xs rounded-lg 
                            opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all 
                            whitespace-nowrap z-50 shadow-lg">
                {n.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-ink-200/60">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 text-xs text-ink-400 hover:text-ink-600 py-1.5 rounded-lg hover:bg-ink-50 transition-all"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", collapsed ? "rotate-180" : "rotate-0")} />
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2 mt-2 px-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span className="text-[10px] text-ink-400 truncate">Powered by your own LLMs</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[#f6f7f9]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/advanced" element={<Advanced />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/memory" element={<MemoryDashboard />} />
            <Route path="/notes/:subType/:id" element={<NotesDetailPage />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/studio/history" element={<StudioHistory />} />
            <Route path="/studio/chat" element={<ChatViewPage />} />
            <Route path="/studio/chat/:id" element={<ChatViewPage />} />
            <Route path="/studio/agent" element={<AgentView source={{ type: 'multi' }} />} />
            <Route path="/studio/voice" element={<VoiceTutor source={{ type: 'multi' }} />} />
            <Route path="/studio/:type/:id" element={<StudioFeaturePage />} />
            <Route path="/studio" element={<StudyStudio />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}