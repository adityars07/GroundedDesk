'use client';

import { useState, useEffect, use } from 'react';
import { apiRequest } from '../../../lib/api';
import {
  ArrowLeft,
  Clock,
  History,
  FileText,
  Globe,
  CheckCircle2,
  Loader2,
  AlertCircle,
  GitCompare,
  Eye,
  Calendar,
  Layers,
} from 'lucide-react';
import Link from 'next/link';

interface KnowledgeSource {
  id: string;
  type: 'PDF' | 'DOCX' | 'MARKDOWN' | 'URL';
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';
  chunkCount: number;
  errorMessage: string | null;
  version: number;
  previousVersionId: string | null;
  createdAt: string;
  url?: string;
}

interface Chunk {
  id: string;
  content: string;
  tokenCount: number;
  metadata: any;
}

interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

// DP line diff generator
function diffLines(oldText: string, newText: string): DiffChange[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const dp: number[][] = Array(oldLines.length + 1)
    .fill(null)
    .map(() => Array(newLines.length + 1).fill(0));

  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffChange[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<KnowledgeSource | null>(null);
  const [history, setHistory] = useState<KnowledgeSource[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [compareSource, setCompareSource] = useState<KnowledgeSource | null>(null);
  const [compareChunks, setCompareChunks] = useState<Chunk[]>([]);
  const [viewMode, setViewMode] = useState<'content' | 'diff'>('content');
  
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingChunks, setLoadingChunks] = useState(true);
  const [loadingCompareChunks, setLoadingCompareChunks] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSourceDetails();
  }, [id]);

  const loadSourceDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest(`/knowledge/${id}`);
      setSource(data);
      
      // Load chunks of current source
      loadChunks(id);

      // Load history of this source name/url
      loadHistory(id);
    } catch (err: any) {
      setError(err.message || 'Failed to load source details.');
      setLoading(false);
    }
  };

  const loadChunks = async (sourceId: string) => {
    try {
      setLoadingChunks(true);
      const res = await apiRequest(`/knowledge/${sourceId}/chunks?page=1&limit=500`);
      setChunks(res.chunks || []);
    } catch (err: any) {
      console.error('Failed to load chunks:', err);
    } finally {
      setLoadingChunks(false);
      setLoading(false);
    }
  };

  const loadHistory = async (sourceId: string) => {
    try {
      setLoadingHistory(true);
      const data = await apiRequest(`/knowledge/${sourceId}/history`);
      setHistory(data || []);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectCompare = async (prevSource: KnowledgeSource) => {
    if (prevSource.id === source?.id) {
      setCompareSource(null);
      setCompareChunks([]);
      setViewMode('content');
      return;
    }

    setCompareSource(prevSource);
    setViewMode('diff');
    setLoadingCompareChunks(true);
    try {
      const res = await apiRequest(`/knowledge/${prevSource.id}/chunks?page=1&limit=500`);
      setCompareChunks(res.chunks || []);
    } catch (err) {
      console.error('Failed to load comparison chunks:', err);
    } finally {
      setLoadingCompareChunks(false);
    }
  };

  const getStatusIcon = (status: KnowledgeSource['status']) => {
    switch (status) {
      case 'READY':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'PROCESSING':
        return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'ARCHIVED':
        return <Layers className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusBadgeClass = (status: KnowledgeSource['status']) => {
    switch (status) {
      case 'READY':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'PROCESSING':
        return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
      case 'FAILED':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'ARCHIVED':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      default:
        return 'bg-slate-500/10 border-slate-500/20 text-slate-400';
    }
  };

  // Compile full text from chunks for diff
  const currentFullText = chunks.map((c) => c.content).join('\n');
  const compareFullText = compareChunks.map((c) => c.content).join('\n');
  const diffResult = viewMode === 'diff' ? diffLines(compareFullText, currentFullText) : [];

  if (loading) {
    return (
      <div className="h-[calc(100vh-12rem)] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm">Loading source details...</p>
        </div>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="space-y-6">
        <Link href="/sources" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Knowledge Base</span>
        </Link>
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error || 'Source not found.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navigation & Header */}
      <div className="space-y-4">
        <Link href="/sources" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Knowledge Base</span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{source.name}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${getStatusBadgeClass(source.status)}`}>
                {getStatusIcon(source.status)}
                <span>{source.status}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-3">
              <span className="flex items-center gap-1">
                {source.type === 'URL' ? <Globe className="w-3.5 h-3.5 text-purple-400" /> : <FileText className="w-3.5 h-3.5 text-indigo-400" />}
                <span>{source.type}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Version {source.version}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Uploaded {new Date(source.createdAt).toLocaleDateString()}</span>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setViewMode('content');
                setCompareSource(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                viewMode === 'content'
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View Content</span>
            </button>
            
            {compareSource && (
              <button
                disabled
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border bg-purple-500/10 border-purple-500/30 text-purple-400"
              >
                <GitCompare className="w-3.5 h-3.5 animate-pulse" />
                <span>Comparing with v{compareSource.version}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Left column: Version History Timeline */}
        <div className="xl:col-span-1 p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-sm text-white">Version History</h3>
          </div>

          {loadingHistory ? (
            <div className="py-6 flex items-center justify-center text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2" />
              <span>Loading versions...</span>
            </div>
          ) : history.length <= 1 ? (
            <p className="text-xs text-slate-500">No previous versions available for this source.</p>
          ) : (
            <div className="relative border-l border-slate-800 pl-4 ml-2 space-y-5">
              {history.map((hist) => {
                const isCurrent = hist.id === source.id;
                const isSelectedForCompare = hist.id === compareSource?.id;
                
                return (
                  <div key={hist.id} className="relative group">
                    {/* Circle marker */}
                    <div
                      className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 transition-all ${
                        isCurrent
                          ? 'bg-indigo-500 border-indigo-500 shadow-md shadow-indigo-500/30 scale-110'
                          : isSelectedForCompare
                          ? 'bg-purple-500 border-purple-500 scale-110'
                          : 'bg-slate-950 border-slate-700 group-hover:border-slate-500'
                      }`}
                    />

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>
                          Version {hist.version} {isCurrent && <span className="text-[9px] text-indigo-400 font-semibold ml-1">(active)</span>}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(hist.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                          {hist.chunkCount} chunks
                        </span>
                        {!isCurrent && (
                          <button
                            onClick={() => handleSelectCompare(hist)}
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                              isSelectedForCompare
                                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                          >
                            {isSelectedForCompare ? 'Cancel Compare' : 'Compare'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Content View or Diff View */}
        <div className="xl:col-span-3 p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm min-h-[400px]">
          {viewMode === 'content' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-white">Parsed Document Content</h3>
                <span className="text-xs text-indigo-400 font-semibold">{chunks.length} chunks indexed</span>
              </div>

              {loadingChunks ? (
                <div className="py-12 flex items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mr-2" />
                  <span>Loading chunks...</span>
                </div>
              ) : chunks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  No chunks indexed for this version.
                </div>
              ) : (
                <div className="space-y-4">
                  {chunks.map((chunk, index) => (
                    <div key={chunk.id} className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2 group hover:border-slate-800 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                          Chunk #{index + 1}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {chunk.tokenCount} tokens
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-850 pb-4">
                <div>
                  <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                    <GitCompare className="w-4 h-4 text-purple-400" />
                    <span>Version Comparison Diff</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Showing changes from v{compareSource?.version} to v{source.version} (active)
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Added</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-red-400 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span>Removed</span>
                  </span>
                </div>
              </div>

              {loadingCompareChunks || loadingChunks ? (
                <div className="py-12 flex items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-500 mr-2" />
                  <span>Generating diff analysis...</span>
                </div>
              ) : diffResult.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  No textual differences detected between these two versions.
                </div>
              ) : (
                <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[600px] overflow-y-auto space-y-0.5">
                  {diffResult.map((change, index) => {
                    if (change.type === 'added') {
                      return (
                        <div key={index} className="px-2 py-0.5 bg-emerald-500/10 border-l-2 border-emerald-500 text-emerald-300">
                          + {change.value}
                        </div>
                      );
                    } else if (change.type === 'removed') {
                      return (
                        <div key={index} className="px-2 py-0.5 bg-red-500/10 border-l-2 border-red-500 text-red-300 line-through">
                          - {change.value}
                        </div>
                      );
                    } else {
                      // Optionally truncate long spans of unchanged text to avoid giant render scrollbars
                      return (
                        <div key={index} className="px-2 py-0.5 text-slate-500">
                            {change.value}
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
