'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '../../../lib/api';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  HelpCircle,
  FilePlus,
  RefreshCw,
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface KnowledgeGap {
  id: string;
  topic: string;
  description: string;
  queryCount: number;
  sampleQueries: string[];
  updatedAt: string;
}

export default function KnowledgeGapsPage() {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);

  async function loadGaps() {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/observability/gaps');
      // Sort gaps by query count descending
      setGaps(Array.isArray(data) ? data.sort((a, b) => b.queryCount - a.queryCount) : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load knowledge gaps.');
    } finally {
      setLoading(false);
    }
  }

  async function triggerAnalysis() {
    try {
      setAnalyzing(true);
      setError('');
      const data = await apiRequest('/observability/gaps/analyze', {
        method: 'POST',
      });
      setGaps(Array.isArray(data) ? data.sort((a, b) => b.queryCount - a.queryCount) : []);
    } catch (err: any) {
      setError(err.message || 'Failed to trigger knowledge gap analysis.');
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    loadGaps();
  }, []);

  const filteredGaps = gaps.filter(
    (gap) =>
      gap.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gap.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAffectedQueries = gaps.reduce((sum, gap) => sum + gap.queryCount, 0);
  const lastUpdated = gaps.length > 0 ? gaps[0].updatedAt : null;

  if (loading) {
    return (
      <div className="h-[calc(100vh-12rem)] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm">Loading knowledge gap analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
            Knowledge Gaps
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Clustered low-confidence queries and customer handoffs indicating missing documentation topics
          </p>
        </div>

        <button
          onClick={triggerAnalysis}
          disabled={analyzing}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-650 hover:bg-indigo-600 disabled:bg-indigo-650/50 text-white border-0 transition-all cursor-pointer shadow-lg shadow-indigo-950/40"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing Gaps...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Run AI Analyzer</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Missing Topics</span>
          <span className="text-3xl font-extrabold text-white mt-1 block">{gaps.length}</span>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Affected Customer Queries</span>
          <span className="text-3xl font-extrabold text-amber-400 mt-1 block">{totalAffectedQueries}</span>
        </div>
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Last Run Timestamp</span>
            <span className="text-xs font-semibold text-slate-300 mt-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800/80 rounded-xl px-3 py-2.5 max-w-md backdrop-blur-sm">
        <Search className="w-4 h-4 text-slate-500 shrink-0" />
        <input
          type="text"
          placeholder="Filter missing topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-sm text-slate-200 border-0 focus:outline-none focus:ring-0 w-full placeholder:text-slate-600"
        />
      </div>

      {/* Gaps List */}
      {filteredGaps.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/20 border border-slate-850 space-y-3">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Knowledge Gaps Detected</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            All recent customer questions have been answered with high confidence using the existing knowledge sources.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredGaps.map((gap) => {
            const isExpanded = expandedGapId === gap.id;
            return (
              <div
                key={gap.id}
                className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl hover:border-slate-700/60 backdrop-blur-sm flex flex-col justify-between gap-5 transition-all shadow-md"
              >
                <div className="space-y-3.5">
                  {/* Topic Title & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-100 text-sm leading-snug">{gap.topic}</h3>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 uppercase tracking-wider">
                      {gap.queryCount} queries
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-450 leading-relaxed">{gap.description}</p>

                  {/* Collapsible Sample Queries */}
                  <div className="pt-2">
                    <button
                      onClick={() => setExpandedGapId(isExpanded ? null : gap.id)}
                      className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase tracking-wider bg-transparent border-0 cursor-pointer p-0 hover:text-indigo-300 transition-colors"
                    >
                      <span>Representative Questions</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-3.5 space-y-2 animate-slide-down">
                        {gap.sampleQueries.map((query, index) => (
                          <div
                            key={index}
                            className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl text-xs text-slate-400 flex items-start gap-2.5"
                          >
                            <HelpCircle className="w-4 h-4 shrink-0 text-slate-650 mt-0.5" />
                            <span className="italic leading-relaxed">&quot;{query}&quot;</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Resolve Action Link */}
                <div className="pt-3 border-t border-slate-850/65 flex justify-end">
                  <a
                    href="/sources"
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700/80 border-0 rounded-lg text-slate-200 transition-all cursor-pointer no-underline"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    <span>Upload Source Document</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
