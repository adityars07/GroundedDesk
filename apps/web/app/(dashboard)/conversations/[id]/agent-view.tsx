'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  id?: string;
  role: 'USER' | 'ASSISTANT' | 'AGENT' | 'SYSTEM';
  content: string;
  agentName?: string;
  createdAt?: string;
}

interface AgentViewProps {
  conversationId: string;
  onResolve?: () => void;
}

export default function AgentView({ conversationId, onResolve }: AgentViewProps) {
  const { data: session } = useSession() as any;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [agentName, setAgentName] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(`${apiUrl}/agent`, {
      auth: { token: session.accessToken },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connected', (data: { agentId: string; agentName: string }) => {
      setAgentName(data.agentName);
      setStatus('connected');
      // Join the specific conversation room
      socket.emit('join', { conversationId });
    });

    socket.on('conversation-history', (data: { messages: ChatMessage[] }) => {
      setMessages(data.messages);
    });

    socket.on('customer-message', (data: { text: string; createdAt: string }) => {
      setMessages((prev) => [
        ...prev,
        { role: 'USER', content: data.text, createdAt: data.createdAt },
      ]);
    });

    socket.on('agent-message', (data: { text: string; agentName: string; createdAt: string }) => {
      setMessages((prev) => [
        ...prev,
        { role: 'AGENT', content: data.text, agentName: data.agentName, createdAt: data.createdAt },
      ]);
    });

    socket.on('conversation-resolved', () => {
      onResolve?.();
    });

    socket.on('error', () => setStatus('error'));

    return () => {
      socket.disconnect();
    };
  }, [session?.accessToken, conversationId, onResolve]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = () => {
    if (!inputText.trim() || !socketRef.current) return;
    socketRef.current.emit('agent-message', { conversationId, text: inputText });
    setInputText('');
  };

  const resolveConversation = () => {
    socketRef.current?.emit('resolve', { conversationId });
  };

  const roleLabel: Record<ChatMessage['role'], string> = {
    USER: 'Customer',
    ASSISTANT: 'AI',
    AGENT: agentName || 'Agent',
    SYSTEM: 'System',
  };

  const roleBg: Record<ChatMessage['role'], string> = {
    USER: 'bg-slate-700 text-slate-100',
    ASSISTANT: 'bg-indigo-900/50 text-indigo-100',
    AGENT: 'bg-emerald-900/50 text-emerald-100',
    SYSTEM: 'bg-slate-800 text-slate-400 italic text-xs',
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              status === 'connected' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
            }`}
          />
          <span className="text-sm font-medium text-slate-200">
            {status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection error' : `Live as ${agentName}`}
          </span>
          <span className="text-xs text-slate-500 font-mono">{conversationId.slice(0, 8)}…</span>
        </div>
        <button
          id="agent-resolve-btn"
          onClick={resolveConversation}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          ✓ Resolve
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-8">
            Waiting for conversation history…
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 max-w-[85%] ${
              msg.role === 'USER' ? 'self-start' : 'self-end'
            }`}
          >
            <span className="text-xs text-slate-500 px-1">
              {roleLabel[msg.role]}
              {msg.createdAt && ` · ${new Date(msg.createdAt).toLocaleTimeString()}`}
            </span>
            <div className={`px-3 py-2 rounded-xl text-sm ${roleBg[msg.role]}`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 flex gap-2">
        <input
          id="agent-reply-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Reply as agent…"
          className="flex-1 px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          id="agent-send-btn"
          onClick={sendMessage}
          disabled={!inputText.trim()}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
