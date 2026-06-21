import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare,
  Send,
  X,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  AlertCircle,
  Link as LinkIcon,
  Shield,
  Paperclip,
  FileText,
} from 'lucide-react';

interface Citation {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  content: string;
  relevanceScore: number;
}

export interface Attachment {
  name: string;
  url: string;
  mimeType: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  citations?: Citation[];
  attachments?: Attachment[];
  rating?: number;
  messageId?: string;
}

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  // File Upload State
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const apiKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tenant Settings (from backend validation response)
  const [widgetColor, setWidgetColor] = useState('#6366f1');
  const [widgetPosition, setWidgetPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [humanHandoffOffered, setHumanHandoffOffered] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    // 1. Resolve API key from script tag
    const script = document.querySelector('script[data-api-key]');
    const apiKey = script?.getAttribute('data-api-key');

    if (!apiKey) {
      console.warn('GroundedDesk widget: data-api-key attribute not found on script tag.');
      return;
    }

    apiKeyRef.current = apiKey;

    // 2. Connect to WebSocket chat namespace
    const socketUrl = 'http://localhost:3000/chat';
    const socketInstance = io(socketUrl, {
      auth: { apiKey },
      autoConnect: false,
    });

    socketInstance.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketInstance.on('connected', (data: { tenantId: string; tenantName: string; settings: any }) => {
      setConnected(true);
      const settings = data.settings || {};
      if (settings.widgetColor) setWidgetColor(settings.widgetColor as string);
      if (settings.widgetPosition) setWidgetPosition(settings.widgetPosition as 'bottom-left' | 'bottom-right');

      // Initialize welcome message
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: (settings.welcomeMessage as string) || 'Hi! How can I help you today?',
        },
      ]);
    });

    socketInstance.on('conversation', (data: { conversationId: string }) => {
      setConversationId(data.conversationId);
    });

    socketInstance.on('token', (data: { text: string; index: number }) => {
      setStreamingMessage((prev) => prev + data.text);
    });

    socketInstance.on(
      'done',
      (data: {
        messageId: string;
        citations: Citation[];
        confidence: number;
      }) => {
        // Complete the stream and finalize message
        setStreamingMessage((fullText) => {
          setMessages((prev) => [
            ...prev,
            {
              id: data.messageId,
              role: 'assistant',
              content: fullText,
              citations: data.citations,
              messageId: data.messageId,
            },
          ]);
          return '';
        });
        setIsSending(false);
      },
    );

    socketInstance.on('low-confidence', () => {
      setHumanHandoffOffered(true);
    });

    socketInstance.on('error', (err: { code: string; message: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'error',
          content: err.message || 'An error occurred.',
        },
      ]);
      setStreamingMessage('');
      setIsSending(false);
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    const apiKey = apiKeyRef.current;
    if (!apiKey) {
      console.error('Cannot upload, API key not found');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3000/api/storage/upload', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to upload file');
      }

      const data = await res.json() as Attachment;
      setPendingAttachments((prev) => [...prev, data]);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && pendingAttachments.length === 0) || isSending || !socket) return;

    const userMsg = inputText.trim();
    const currentAttachments = [...pendingAttachments];
    setInputText('');
    setPendingAttachments([]);
    setIsSending(true);
    setStreamingMessage('');

    // Append user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMsg,
        attachments: currentAttachments,
      },
    ]);

    // Emit event
    socket.emit('message', {
      text: userMsg,
      conversationId: conversationId || undefined,
      attachments: currentAttachments,
    });
  };

  const handleRating = (messageId: string, rating: number) => {
    if (!socket || !conversationId) return;

    socket.emit('feedback', {
      conversationId,
      rating,
    });

    setMessages((prev) =>
      prev.map((msg) => (msg.messageId === messageId ? { ...msg, rating } : msg)),
    );
  };

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'fixed',
        bottom: '20px',
        left: widgetPosition === 'bottom-left' ? '20px' : 'auto',
        right: widgetPosition === 'bottom-right' ? '20px' : 'auto',
        zIndex: 999999,
      }}
    >
      {/* ── Widget Trigger Button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{ backgroundColor: widgetColor }}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer border-0 active:scale-95"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* ── Chat Window Box ── */}
      {isOpen && (
        <div className="w-[360px] h-[500px] sm:w-[380px] sm:h-[540px] bg-slate-950 border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">
          {/* Header */}
          <div
            style={{ backgroundColor: widgetColor }}
            className="h-14 px-4 flex items-center justify-between text-white shrink-0 shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-xs block">AI Support Assistant</span>
                <span className="text-[10px] text-white/80 block mt-0.5 font-medium flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                    }`}
                  />
                  {connected ? 'Ready to answer' : 'Connecting...'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer border-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950 text-slate-100 flex flex-col">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isError = msg.role === 'error';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    style={{
                      backgroundColor: isUser ? `${widgetColor}15` : isError ? '#ef444415' : '#1e293b60',
                      borderColor: isUser ? `${widgetColor}35` : isError ? '#ef444425' : '#33415550',
                    }}
                    className="max-w-[85%] p-3.5 rounded-2xl border text-xs leading-relaxed"
                  >
                    {isError && <AlertCircle className="w-4 h-4 text-red-400 mb-1" />}
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Attachments rendering */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {msg.attachments.map((att, idx) => {
                          const isImg = att.mimeType.startsWith('image/');
                          return (
                            <div key={idx} className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 max-w-[200px]">
                              {isImg ? (
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  className="w-full h-auto max-h-[150px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(att.url, '_blank')}
                                />
                              ) : (
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 flex items-center gap-2 text-[10px] text-slate-300 hover:text-white no-underline"
                                >
                                  <FileText className="w-4 h-4 shrink-0 text-indigo-400" />
                                  <span className="truncate">{att.name}</span>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Citations list */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                        <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">Citations</span>
                        {msg.citations.map((cite) => (
                          <div key={cite.chunkId} className="p-1.5 bg-slate-900/60 border border-slate-850 rounded-lg text-[9px]">
                            <div className="flex justify-between items-center text-[8px] text-slate-500 font-semibold mb-0.5">
                              <span className="flex items-center gap-0.5"><LinkIcon className="w-2.5 h-2.5" />{cite.sourceName}</span>
                            </div>
                            <p className="text-slate-400 italic line-clamp-2">&quot;{cite.content}&quot;</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Thumbs Feedback */}
                    {!isUser && !isError && msg.messageId && (
                      <div className="mt-3 pt-2 border-t border-slate-800/40 flex items-center justify-between">
                        <span className="text-[9px] text-slate-500">Was this helpful?</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRating(msg.messageId!, 5)}
                            disabled={msg.rating !== undefined}
                            className={`p-1 rounded hover:bg-slate-900 border-0 cursor-pointer ${
                              msg.rating === 5 ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRating(msg.messageId!, 1)}
                            disabled={msg.rating !== undefined}
                            className={`p-1 rounded hover:bg-slate-900 border-0 cursor-pointer ${
                              msg.rating === 1 ? 'text-red-400' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live Streaming Loader Bubble */}
            {streamingMessage && (
              <div className="flex flex-col items-start">
                <div className="max-w-[85%] p-3 bg-slate-900/40 border border-slate-800/60 rounded-2xl rounded-tl-none text-xs text-slate-100">
                  <p className="whitespace-pre-wrap">{streamingMessage}</p>
                </div>
              </div>
            )}

            {/* Loading Spinner during socket wait */}
            {isSending && !streamingMessage && (
              <div className="flex items-center gap-2 text-[10px] text-slate-500 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}

            {/* Handoff suggestion card */}
            {humanHandoffOffered && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/25 rounded-xl text-center space-y-2">
                <p className="text-[10px] text-indigo-300">
                  My confidence is low on this query. Would you like to reach out to a human support representative?
                </p>
                <button
                  onClick={() => {
                    alert('Handoff triggered! A human support representative has been alerted.');
                    setHumanHandoffOffered(false);
                  }}
                  style={{ backgroundColor: widgetColor }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow hover:scale-102 transition-transform cursor-pointer border-0 active:scale-98"
                >
                  Connect to Human
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending Attachments List */}
          {pendingAttachments.length > 0 && (
            <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-800/50 flex flex-wrap gap-2 shrink-0">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px]">
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.url} alt={att.name} className="w-5 h-5 rounded object-cover" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span className="truncate max-w-[100px] text-slate-300">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(i)}
                    className="text-slate-500 hover:text-white border-0 bg-transparent p-0 cursor-pointer flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Form Input Footer */}
          <form
            onSubmit={handleSend}
            className="h-16 px-4 border-t border-slate-800 bg-slate-900/40 flex items-center gap-2 shrink-0"
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              ref={fileInputRef}
            />
            <button
              type="button"
              disabled={isUploading || isSending || !connected}
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors cursor-pointer border-0 active:scale-95 disabled:opacity-50 text-slate-400 hover:text-slate-200"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask a question..."
              disabled={isSending || !connected}
              className="flex-1 min-w-0 bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || isSending || !connected}
              style={{ backgroundColor: (inputText.trim() || pendingAttachments.length > 0) && !isSending && connected ? widgetColor : '#1e293b' }}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 hover:scale-105 duration-150 cursor-pointer border-0 active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
