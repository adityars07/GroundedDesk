'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest, getToken } from '../../lib/api';
import {
  Database,
  Upload,
  Globe,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  FileText,
  Search,
} from 'lucide-react';
import Link from 'next/link';

interface KnowledgeSource {
  id: string;
  type: 'PDF' | 'DOCX' | 'MARKDOWN' | 'URL';
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Crawler state
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawlName, setCrawlName] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState('');

  const loadSources = useCallback(async () => {
    try {
      const data = await apiRequest('/knowledge');
      setSources(data);
    } catch (err) {
      const errorVal = err as Error;
      setError(errorVal.message || 'Failed to fetch knowledge sources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSources();
    });
    // Poll sources every 5 seconds to track background workers processing uploads
    const interval = setInterval(loadSources, 5000);
    return () => clearInterval(interval);
  }, [loadSources]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFileName(selectedFile.name.split('.')[0]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !fileName.trim()) {
      setUploadError('Please select a file and enter a name.');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', fileName);

      const response = await fetch('http://localhost:3000/api/knowledge/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      setFile(null);
      setFileName('');
      // Trigger upload file input reset
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      await loadSources();
    } catch (err) {
      const errorVal = err as Error;
      setUploadError(errorVal.message || 'Failed to upload source file.');
    } finally {
      setUploading(false);
    }
  };

  const handleCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crawlUrl.trim() || !crawlName.trim()) {
      setCrawlError('Please fill in both fields.');
      return;
    }

    setCrawling(true);
    setCrawlError('');

    try {
      await apiRequest('/knowledge/crawl', {
        method: 'POST',
        body: JSON.stringify({ url: crawlUrl, name: crawlName }),
      });

      setCrawlUrl('');
      setCrawlName('');
      await loadSources();
    } catch (err) {
      const errorVal = err as Error;
      setCrawlError(errorVal.message || 'Failed to start URL crawling.');
    } finally {
      setCrawling(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source? This will remove all associated vector chunks.')) {
      return;
    }

    try {
      await apiRequest(`/knowledge/${id}`, {
        method: 'DELETE',
      });
      setSources(sources.filter((s) => s.id !== id));
    } catch (err) {
      const errorVal = err as Error;
      alert(errorVal.message || 'Failed to delete source.');
    }
  };

  const filteredSources = sources.filter((source) =>
    source.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getStatusIcon = (status: KnowledgeSource['status']) => {
    switch (status) {
      case 'READY':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'PROCESSING':
        return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
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
      default:
        return 'bg-slate-500/10 border-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-slate-400 mt-1">Upload files or crawl URLs to inject knowledge into the model</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload File Card */}
        <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Upload className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-sm text-white">Upload File Source</h2>
          </div>

          {uploadError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <form onSubmit={handleFileUpload} className="space-y-4">
            <div className="border-2 border-dashed border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-colors flex flex-col items-center justify-center text-center cursor-pointer relative">
              <input
                id="file-input"
                type="file"
                accept=".pdf,.docx,.md"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileText className="w-8 h-8 text-slate-500 mb-2" />
              <span className="text-xs font-semibold text-slate-300">
                {file ? file.name : 'Click to select PDF, DOCX, or Markdown'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Max file size 10MB</span>
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1" htmlFor="filename">
                Source Name
              </label>
              <input
                id="filename"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Product Manual v2"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-white placeholder-slate-500 transition-all text-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/10 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading File...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Ingest File</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Crawl URL Card */}
        <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Globe className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-sm text-white">Crawl Sitemap URL</h2>
          </div>

          {crawlError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{crawlError}</span>
            </div>
          )}

          <form onSubmit={handleCrawl} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1" htmlFor="crawlUrl">
                Sitemap XML or Website URL
              </label>
              <input
                id="crawlUrl"
                type="url"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                placeholder="https://company.com/sitemap.xml"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/10 text-white placeholder-slate-500 transition-all text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1" htmlFor="crawlName">
                Source Name
              </label>
              <input
                id="crawlName"
                type="text"
                value={crawlName}
                onChange={(e) => setCrawlName(e.target.value)}
                placeholder="Help Center Docs"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/10 text-white placeholder-slate-500 transition-all text-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={crawling || !crawlUrl || !crawlName}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-600/10 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            >
              {crawling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Crawling Website...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Ingest URL</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Sources List Section */}
      <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-semibold text-sm text-white">Ingested Sources</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Documents and sites currently loaded in knowledge base</p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sources..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-white placeholder-slate-500 transition-all text-xs"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mr-2" />
            <span>Loading sources...</span>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/20 flex flex-col items-center gap-2">
            <Database className="w-8 h-8 text-slate-600" />
            <span>No knowledge sources found. Ingest files or URLs above to start.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-slate-400 font-semibold">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 px-4">Type</th>
                  <th className="pb-3 px-4">Status</th>
                  <th className="pb-3 px-4">Chunks</th>
                  <th className="pb-3 px-4">Ingested Date</th>
                  <th className="pb-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((source) => (
                  <tr key={source.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/10 group transition-all">
                    <td className="py-3.5 pr-4 font-semibold text-white truncate max-w-[200px]">
                      <Link href={`/sources/${source.id}`} className="hover:text-indigo-400 hover:underline transition-colors">
                        {source.name}
                      </Link>
                      {source.status === 'FAILED' && source.errorMessage && (
                        <span className="block text-[10px] text-red-400/90 font-normal mt-0.5 truncate max-w-[250px]">
                          {source.errorMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-950/60 border border-slate-800/80 text-slate-300 text-[10px] font-semibold uppercase tracking-wider">
                        {source.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-medium ${getStatusBadgeClass(source.status)}`}>
                        {getStatusIcon(source.status)}
                        <span>{source.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-300">
                      {source.status === 'READY' ? source.chunkCount : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(source.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all active:scale-95"
                        title="Delete Source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
