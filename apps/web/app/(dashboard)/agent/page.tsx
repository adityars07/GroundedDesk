'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import AgentView from '../conversations/[id]/agent-view';

interface EscalatedConversation {
  id: string;
  sessionId: string;
  status: string;
  updatedAt: string;
  messageCount?: number;
}

/**
 * Agent Inbox — shows all ESCALATED conversations that need a human agent.
 * Clicking a conversation opens the live AgentView panel.
 */
export default function AgentInboxPage() {
  const { data: session } = useSession() as any;
  const [conversations, setConversations] = useState<EscalatedConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEscalated = async () => {
    if (!session?.accessToken) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/conversations?status=ESCALATED`,
        {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // silently fail — not critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalated();
    // Poll every 15 seconds for new escalations
    const interval = setInterval(fetchEscalated, 15_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const handleResolve = () => {
    setSelected(null);
    fetchEscalated();
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar — escalated list */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-semibold text-slate-100">Agent Inbox</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
            {conversations.length} escalated
          </span>
        </div>

        {loading && (
          <div className="text-slate-500 text-sm">Loading conversations…</div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
            <span className="text-3xl">🎉</span>
            <p>No escalated conversations</p>
          </div>
        )}

        {conversations.map((conv) => (
          <button
            key={conv.id}
            id={`escalated-conv-${conv.id.slice(0, 8)}`}
            onClick={() => setSelected(conv.id)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              selected === conv.id
                ? 'border-indigo-500 bg-indigo-950/40'
                : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-200 truncate">
                  Session: {conv.sessionId.slice(0, 12)}…
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updated {new Date(conv.updatedAt).toLocaleTimeString()}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400">
                LIVE
              </span>
            </div>
          </button>
        ))}
      </aside>

      {/* Main panel — live agent view */}
      <main className="flex-1">
        {selected ? (
          <AgentView conversationId={selected} onResolve={handleResolve} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <span className="text-5xl">💬</span>
            <p className="text-base">Select a conversation to join</p>
            <p className="text-sm text-slate-600">
              Click any escalated conversation on the left to take over
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
