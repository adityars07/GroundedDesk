'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, clearToken } from '../lib/api';
import {
  LayoutDashboard,
  Database,
  MessageSquare,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ChevronDown,
  Headphones,
  Sparkles,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    } else {
      setCurrentUser(user);
    }
  }, [router]);

  const handleSignOut = () => {
    clearToken();
    router.push('/login');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 animate-spin" />
          <p className="text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Knowledge Base', href: '/sources', icon: Database },
    { name: 'Knowledge Gaps', href: '/observability/gaps', icon: Sparkles },
    { name: 'Conversations', href: '/conversations', icon: MessageSquare },
    { name: 'Agent Inbox', href: '/agent', icon: Headphones },
    { name: 'Observability', href: '/observability', icon: Activity },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans antialiased">
      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800/80 p-5 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:flex lg:flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <span className="font-bold text-white text-base">G</span>
            </div>
            <span className="font-bold text-white text-base">GroundedDesk</span>
          </div>
          <button className="lg:hidden p-1 text-slate-400 hover:text-slate-200" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tenant Switcher Card */}
        <div className="mb-6 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <div className="truncate">
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Active Workspace</span>
            <span className="font-semibold text-xs text-white truncate block">{currentUser.tenant?.name || 'Workspace'}</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-semibold uppercase tracking-wider shrink-0 ml-2">
            Owner
          </span>
        </div>

        {/* Sidebar Nav items */}
        <nav className="space-y-1.5 flex-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div className="border-t border-slate-800/60 pt-4 mt-auto">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium text-left"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Dashboard body wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Header bar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between lg:justify-end gap-4 relative z-30">
          <button
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Header Action Items */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/50 text-slate-300 text-sm font-medium transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="max-w-[120px] truncate">{currentUser.name || currentUser.email}</span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              {userDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800/80 rounded-xl shadow-xl p-1.5 z-20">
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-xs font-medium text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
