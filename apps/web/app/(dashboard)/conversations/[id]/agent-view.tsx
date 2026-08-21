'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_ORIGIN, getToken } from '../../../lib/api';
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
  const token = getToken();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [agentName, setAgentName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleApproveTool = (messageId: string, toolCallId: string, name: string, args: any) => {
    if (!socketRef.current) return;
    socketRef.current.emit('approve-tool-call', {
      conversationId,
      messageId,
      toolCallId,
      name,
      arguments: args,
    });
  };

  const handleRejectTool = (messageId: string, toolCallId: string, name: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('reject-tool-call', {
      conversationId,
      messageId,
      toolCallId,
      name,
    });
  };

  useEffect(() => {
    if (!token) return;

    const socket = io(`${API_ORIGIN}/agent`, {
      auth: { token },
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
      setSuggestions([]); // Clear old suggestions on new message
      setStreamingMessage('');
    });

    socket.on('copilot:suggestions', (data: { suggestions: string[] }) => {
      setSuggestions(data.suggestions);
    });

    socket.on('agent-message', (data: { text: string; agentName: string; createdAt: string }) => {
      setMessages((prev) => [
        ...prev,
        { role: 'AGENT', content: data.text, agentName: data.agentName, createdAt: data.createdAt },
      ]);
    });

    socket.on('token', (data: { text: string; conversationId?: string }) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      setStreamingMessage((prev) => prev + data.text);
    });

    socket.on('done', (data: { messageId: string; conversationId?: string }) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      setStreamingMessage((fullText) => {
        if (fullText) {
          setMessages((prev) => [
            ...prev,
            { role: 'ASSISTANT', content: fullText, id: data.messageId },
          ]);
        }
        return '';
      });
    });

    socket.on('tool-call-pending', (data: { toolCalls: any[] }) => {
      setMessages((prev) => {
        const firstCall = data.toolCalls[0];
        const callsStr = `PENDING_TOOL_CALL:${JSON.stringify(firstCall)}`;
        if (prev.some((m) => m.content === callsStr)) return prev;
        return [
          ...prev,
          { role: 'SYSTEM', content: callsStr },
        ];
      });
    });

    socket.on('tool-call-approved', (data: { toolCallId: string; result: any }) => {
      setMessages((prev) =>
        prev
          .map((m) => {
            if (m.role === 'SYSTEM' && m.content.startsWith('PENDING_TOOL_CALL:') && m.content.includes(data.toolCallId)) {
              return {
                ...m,
                content: m.content.replace('PENDING_TOOL_CALL:', 'APPROVED_TOOL_CALL:'),
              };
            }
            return m;
          })
          .concat({
            role: 'SYSTEM',
            content: `Action executed successfully. Result: ${JSON.stringify(data.result)}`,
          })
      );
    });

    socket.on('tool-call-rejected', (data: { toolCallId: string }) => {
      setMessages((prev) =>
        prev
          .map((m) => {
            if (m.role === 'SYSTEM' && m.content.startsWith('PENDING_TOOL_CALL:') && m.content.includes(data.toolCallId)) {
              return {
                ...m,
                content: m.content.replace('PENDING_TOOL_CALL:', 'REJECTED_TOOL_CALL:'),
              };
            }
            return m;
          })
          .concat({
            role: 'SYSTEM',
            content: `Action execution rejected by agent.`,
          })
      );
    });

    socket.on('conversation-resolved', () => {
      onResolve?.();
    });

    socket.on('error', () => setStatus('error'));

    return () => {
      socket.disconnect();
    };
  }, [token, conversationId, onResolve]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  const sendMessage = () => {
    if (!inputText.trim() || !socketRef.current) return;
    socketRef.current.emit('agent-message', { conversationId, text: inputText });
    setInputText('');
    setSuggestions([]); // Clear suggestions after replying
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
    USER: 'bg-slate-100 text-slate-800 border border-slate-200/60',
    ASSISTANT: 'bg-[#FAF9FF] text-purple-950 border border-purple-100/80',
    AGENT: 'bg-emerald-50 text-emerald-950 border border-emerald-100/80',
    SYSTEM: 'bg-slate-50 text-slate-500 border border-slate-200/50 italic text-xs',
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              status === 'connected' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-amber-500'
            }`}
          />
          <span className="text-sm font-semibold text-slate-700">
            {status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection error' : `Live as ${agentName}`}
          </span>
          <span className="text-xs text-slate-400 font-mono">{conversationId.slice(0, 8)}…</span>
        </div>
        <button
          id="agent-resolve-btn"
          onClick={resolveConversation}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors animate-fade-in cursor-pointer shadow-sm shadow-emerald-500/10"
        >
          ✓ Resolve
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col bg-white">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-sm mt-8">
            Waiting for conversation history…
          </div>
        )}
        {messages.map((msg, i) => {
          const isPending = msg.role === 'SYSTEM' && msg.content.startsWith('PENDING_TOOL_CALL:');
          const isApproved = msg.role === 'SYSTEM' && msg.content.startsWith('APPROVED_TOOL_CALL:');
          const isRejected = msg.role === 'SYSTEM' && msg.content.startsWith('REJECTED_TOOL_CALL:');

          if (isPending) {
            let toolCall: any = null;
            try {
              toolCall = JSON.parse(msg.content.substring('PENDING_TOOL_CALL:'.length));
            } catch {}

            if (toolCall) {
              return (
                <div
                  key={i}
                  className="self-center w-full max-w-md p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3 my-2 shadow-sm animate-fade-in"
                >
                  <div className="flex items-center gap-2 text-amber-600 font-medium">
                    <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">Action Approval Required</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    AI requested to execute: <strong className="text-slate-800 font-mono">{toolCall.name}</strong>
                  </p>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-40 shadow-inner">
                    {JSON.stringify(
                      typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments,
                      null,
                      2
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => handleRejectTool(msg.id || '', toolCall.id, toolCall.name)}
                      className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold transition-all cursor-pointer border border-slate-200"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() =>
                        handleApproveTool(
                          msg.id || '',
                          toolCall.id,
                          toolCall.name,
                          typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg font-bold shadow-md shadow-purple-500/10 transition-all cursor-pointer"
                    >
                      Approve Action
                    </button>
                  </div>
                </div>
              );
            }
          }

          let displayContent = msg.content;
          if (isApproved) {
            try {
              const tc = JSON.parse(msg.content.substring('APPROVED_TOOL_CALL:'.length));
              displayContent = `✓ Action approved: ${tc.name}`;
            } catch {
              displayContent = `✓ Action approved`;
            }
          } else if (isRejected) {
            try {
              const tc = JSON.parse(msg.content.substring('REJECTED_TOOL_CALL:'.length));
              displayContent = `✗ Action rejected: ${tc.name}`;
            } catch {
              displayContent = `✗ Action rejected`;
            }
          }

          return (
            <div
              key={i}
              className={`flex flex-col gap-1 max-w-[85%] ${
                msg.role === 'USER' ? 'self-start' : msg.role === 'SYSTEM' ? 'self-center text-center' : 'self-end'
              }`}
            >
              <span className="text-[10px] text-slate-400 px-1 font-medium">
                {roleLabel[msg.role]}
                {msg.createdAt && ` · ${new Date(msg.createdAt).toLocaleTimeString()}`}
              </span>
              <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${roleBg[msg.role]}`}>
                {displayContent}
              </div>
            </div>
          );
        })}
        {streamingMessage && (
          <div className="flex flex-col gap-1 max-w-[85%] self-end animate-pulse">
            <span className="text-[10px] text-slate-400 px-1 font-medium">AI (Streaming)</span>
            <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${roleBg['ASSISTANT']}`}>
              {streamingMessage}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Copilot Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-3 bg-[#FAF9FF] border-t border-purple-100 flex flex-col gap-2 shrink-0 animate-slide-up">
          <span className="text-[10px] text-[#7C3AED] font-bold uppercase tracking-wider">AI Suggested Replies (Click to apply)</span>
          <div className="flex flex-col gap-2">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => {
                  setInputText(sug);
                  setSuggestions([]);
                }}
                className="px-3.5 py-2 text-xs text-left bg-white border border-purple-100 rounded-xl hover:border-[#7C3AED]/30 hover:bg-purple-50/30 text-slate-700 transition-all cursor-pointer w-full leading-relaxed shadow-sm font-medium"
                title={sug}
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
        <input
          id="agent-reply-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Reply as agent…"
          className="flex-1 px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/10 focus:border-[#7C3AED]"
        />
        <button
          id="agent-send-btn"
          onClick={sendMessage}
          disabled={!inputText.trim()}
          className="px-4 py-2 text-sm font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-purple-500/10"
        >
          Send
        </button>
      </div>
    </div>
  );
}
