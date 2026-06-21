'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Settings,
  Key,
  Code,
  Save,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Activity,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface TenantSettings {
  welcomeMessage: string;
  confidenceThreshold: number;
  widgetColor: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'keys' | 'widget'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // General Settings State
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.6);
  const [widgetColor, setWidgetColor] = useState('#6366f1');
  const [widgetPosition, setWidgetPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Widget Copy State
  const [copiedEmbedCode, setCopiedEmbedCode] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Load current tenant settings
      const tenant = await apiRequest('/tenant/me');
      const settings = tenant?.settings || {};
      
      setWelcomeMessage(settings.welcomeMessage || 'Hi! How can I help you today?');
      setConfidenceThreshold(settings.confidenceThreshold !== undefined ? parseFloat(settings.confidenceThreshold) : 0.6);
      setWidgetColor(settings.widgetColor || '#6366f1');
      setWidgetPosition(settings.widgetPosition || 'bottom-right');

      // Load API Keys
      const keys = await apiRequest('/auth/api-keys');
      setApiKeys(keys);
    } catch (err) {
      const errorVal = err as Error;
      setError(errorVal.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadData();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      await apiRequest('/tenant/me', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            welcomeMessage,
            confidenceThreshold,
            widgetColor,
            widgetPosition,
          },
        }),
      });
      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      const errorVal = err as Error;
      setError(errorVal.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setGeneratingKey(true);
    setError('');
    setGeneratedKey(null);

    try {
      const result = await apiRequest('/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName }),
      });

      setGeneratedKey(result.key);
      setNewKeyName('');
      
      // Reload keys
      const keys = await apiRequest('/auth/api-keys');
      setApiKeys(keys);
    } catch (err) {
      const errorVal = err as Error;
      setError(errorVal.message || 'Failed to create API key.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Widget requests using it will be blocked immediately.')) {
      return;
    }

    try {
      await apiRequest(`/auth/api-keys/${id}`, {
        method: 'DELETE',
      });
      setApiKeys(apiKeys.filter((k) => k.id !== id));
    } catch (err) {
      const errorVal = err as Error;
      alert(errorVal.message || 'Failed to revoke API key.');
    }
  };

  const copyToClipboard = (text: string, isEmbed: boolean) => {
    navigator.clipboard.writeText(text);
    if (isEmbed) {
      setCopiedEmbedCode(true);
      setTimeout(() => setCopiedEmbedCode(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };



  const embedCode = `<!-- GroundedDesk Chat Widget -->
<script
  src="http://localhost:3000/widget.js"
  data-api-key="${apiKeys[0] ? 'gd_live_...' : 'YOUR_API_KEY'}"
  defer>
</script>`;

  if (loading) {
    return (
      <div className="h-[calc(100vh-12rem)] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your chat widget, API keys, and model boundaries</p>
      </div>

      {/* Tabs list */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all -mb-px ${
            activeTab === 'general'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>General Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('keys')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all -mb-px ${
            activeTab === 'keys'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>API Keys</span>
        </button>

        <button
          onClick={() => setActiveTab('widget')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all -mb-px ${
            activeTab === 'widget'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Code className="w-4 h-4" />
          <span>Widget Embed</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── TAB 1: General Settings ────────────────── */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm space-y-5">
            <h3 className="font-semibold text-sm text-white mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Chat Customization</span>
            </h3>

            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5" htmlFor="welcome">
                Welcome Message
              </label>
              <textarea
                id="welcome"
                rows={2}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-white placeholder-slate-500 transition-all text-xs resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5" htmlFor="threshold">
                  Confidence Threshold ({confidenceThreshold})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="threshold"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                  Minimum LLM confidence required. Below this, the widget triggers a human agent handoff suggestion.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5" htmlFor="color">
                  Widget Branding Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="color"
                    type="color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-800 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="w-24 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5" htmlFor="position">
                Widget Float Position
              </label>
              <select
                id="position"
                value={widgetPosition}
                onChange={(e) => setWidgetPosition(e.target.value as 'bottom-right' | 'bottom-left')}
                className="px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-white text-xs"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/10 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* ── TAB 2: API Keys ────────────────── */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          {/* Create API Key */}
          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm">
            <h3 className="font-semibold text-sm text-white mb-4 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Generate New API Key</span>
            </h3>

            {generatedKey && (
              <div className="mb-5 p-4 bg-emerald-500/5 border border-emerald-500/25 rounded-xl space-y-2.5">
                <span className="block text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  Key Generated - Copy it now!
                </span>
                <p className="text-[10px] text-slate-400 leading-normal">
                  For security reasons, this key will only be shown once. If you lose it, you will have to generate a new one.
                </p>
                <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                  <span className="font-mono text-xs text-white select-all break-all flex-1">{generatedKey}</span>
                  <button
                    onClick={() => copyToClipboard(generatedKey, false)}
                    className="p-1 rounded bg-slate-900 border border-slate-800 hover:text-white transition-all"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateApiKey} className="flex gap-3">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Production Chat Widget Key"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-white placeholder-slate-500 transition-all text-xs"
                required
              />
              <button
                type="submit"
                disabled={generatingKey || !newKeyName.trim()}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/10 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 shrink-0"
              >
                {generatingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Generate Key</span>
              </button>
            </form>
          </div>

          {/* Keys List */}
          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm">
            <h3 className="font-semibold text-sm text-white mb-4">Active API Keys</h3>

            {apiKeys.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                No active API keys found. Generate one above to connect the chat widget.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-slate-400 font-semibold">
                      <th className="pb-3 pr-4">Name</th>
                      <th className="pb-3 px-4">Key Prefix</th>
                      <th className="pb-3 px-4">Created At</th>
                      <th className="pb-3 px-4">Last Used</th>
                      <th className="pb-3 pl-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-850/20 transition-all">
                        <td className="py-3.5 pr-4 font-semibold text-white truncate max-w-[150px]">{key.name}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">{key.keyPrefix}...</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(key.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {key.lastUsedAt ? (
                            new Date(key.lastUsedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          ) : (
                            <span className="text-slate-600 font-medium">Never</span>
                          )}
                        </td>
                        <td className="py-3.5 pl-4 text-right">
                          <button
                            onClick={() => handleDeleteApiKey(key.id)}
                            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all active:scale-95"
                            title="Revoke Key"
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
      )}

      {/* ── TAB 3: Widget Embed ────────────────── */}
      {activeTab === 'widget' && (
        <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-sm space-y-5">
          <h3 className="font-semibold text-sm text-white mb-2 flex items-center gap-1.5">
            <Code className="w-4 h-4 text-indigo-400" />
            <span>Copy HTML Snippet</span>
          </h3>

          <p className="text-xs text-slate-400 leading-normal">
            To embed the chat widget on your business site, paste this code snippet into the HTML source body. 
            Make sure to use an active API key generated from the API Keys tab.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border border-slate-850 rounded-t-xl border-b-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Embed Code</span>
              <button
                onClick={() => copyToClipboard(embedCode, true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-850 bg-slate-900 text-[10px] font-semibold text-slate-400 hover:text-white transition-colors"
              >
                {copiedEmbedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            
            <pre className="p-4 bg-slate-950 border border-slate-850 rounded-b-xl text-[11px] font-mono text-indigo-300 leading-relaxed overflow-x-auto select-all">
              {embedCode}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
