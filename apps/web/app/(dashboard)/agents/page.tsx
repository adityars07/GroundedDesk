'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Phone,
  Bot,
  Play,
  Volume2,
  Settings,
  Code,
  Sparkles,
  BookOpen,
  Check,
  X,
  VolumeX,
  Send,
  Loader2,
  Trash2,
} from 'lucide-react';

// Interfaces
interface PredefinedFunctions {
  enableEndCall: boolean;
  dialKeypad: boolean;
  forwardingNumber: string;
  endCallPhrase: string;
}

interface CustomFunction {
  name: string;
  description: string;
  parameters: string;
}

interface Agent {
  id: string;
  name: string;
  templateName?: string;
  trainingFile: string;
  temperature: number;
  maxTokens: number;
  detectEmotion: boolean;
  firstMessage: string;
  systemPrompt: string;
  voiceName: string;
  language: string;
  voiceModel: string;
  backgroundSound: string;
  patienceLevel: string;
  voicePrompting: string;
  liveFunctions: string;
  toolFunctions: string;
  predefinedFunctions: PredefinedFunctions;
  customFunctions: CustomFunction[];
}

const TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Efficiently handle FAQs, troubleshoot issues, and provide instant resolutions to user queries.',
    iconColor: 'text-[#8B5CF6] border-purple-200 bg-purple-50',
    iconBg: 'bg-[#8B5CF6]/10',
    systemPrompt: `You are a professional customer support assistant. Your goal is to guide the user politely, answer their product queries, and resolve any standard issues they describe. Refer to files and documentation when possible.`,
    firstMessage: 'Hello! Thank you for contacting support. How can I help you today?',
  },
  {
    id: 'appointment-setter',
    name: 'Appointment Setter',
    description: 'Streamline bookings by managing appointments and sending reminders with ease.',
    iconColor: 'text-[#06B6D4] border-cyan-200 bg-cyan-50',
    iconBg: 'bg-[#06B6D4]/10',
    systemPrompt: `You are an appointment setting assistant. Ask the user for their preferred dates and times, gather their contact details, and confirm the booking once they agree.`,
    firstMessage: 'Hi there! I can help you schedule an appointment. What day and time works best for you?',
  },
  {
    id: 'feedback-collector',
    name: 'Feedback Collector',
    description: 'Capture user reviews, suggestions, and insights for continuous improvement.',
    iconColor: 'text-[#10B981] border-emerald-200 bg-emerald-50',
    iconBg: 'bg-[#10B981]/10',
    systemPrompt: `You are a customer feedback assistant. Ask the user about their experience, prompt for ratings on a 1-5 scale, and collect qualitative details about what we can improve.`,
    firstMessage: 'Hello! We would love to hear your thoughts on our service. How has your experience been so far?',
  },
  {
    id: 'sales-assistant',
    name: 'Sales Assistant',
    description: 'Guide users through products, answer queries, and support purchasing decisions.',
    iconColor: 'text-[#F59E0B] border-amber-200 bg-amber-50',
    iconBg: 'bg-[#F59E0B]/10',
    systemPrompt: `You are an upbeat sales assistant. Inquire about the customer's needs, explain product features, address sales concerns, and guide them to check out.`,
    firstMessage: 'Hey! Welcome to our store. Are you looking for something specific, or just browsing?',
  },
  {
    id: 'onboarding-helper',
    name: 'Onboarding Helper',
    description: 'Welcome new users with step-by-step guidance and answer initial questions.',
    iconColor: 'text-[#3B82F6] border-blue-200 bg-blue-50',
    iconBg: 'bg-[#3B82F6]/10',
    systemPrompt: `You are an onboarding specialist assistant. Walk the user through setting up their workspace, explain basic features, and ensure they feel confident getting started.`,
    firstMessage: "Welcome aboard! Let's get you set up. Have you logged into your dashboard yet?",
  },
  {
    id: 'event-reminder',
    name: 'Event Reminder',
    description: 'Send timely notifications for meetings, events, and important deadlines.',
    iconColor: 'text-[#EF4444] border-red-200 bg-red-50',
    iconBg: 'bg-[#EF4444]/10',
    systemPrompt: `You are an automated event reminder assistant. Inform users of upcoming events, ask if they can attend, and offer to reschedule or provide details if requested.`,
    firstMessage: 'Hello! This is a quick reminder for your meeting scheduled tomorrow at 10 AM. Will you be attending?',
  },
  {
    id: 'lead-qualifier',
    name: 'Lead Qualifier',
    description: 'Engage prospects, ask qualifying questions, and pass on leads to your sales team.',
    iconColor: 'text-[#F97316] border-orange-200 bg-orange-50',
    iconBg: 'bg-[#F97316]/10',
    systemPrompt: `You are a professional lead qualification agent. Ask strategic questions about budget, authority, timeline, and product fit to qualify incoming prospects.`,
    firstMessage: 'Hello! Thanks for your interest in GroundedDesk. What is the size of your customer service team?',
  },
  {
    id: 'hr-assistant',
    name: 'HR Assistant',
    description: 'Answer employee inquiries about policies, leave, and more while automating HR tasks.',
    iconColor: 'text-[#D946EF] border-pink-200 bg-pink-50',
    iconBg: 'bg-[#D946EF]/10',
    systemPrompt: `You are a supportive HR assistant. Guide employees through policy lookups, explain leave policies, and answer questions about benefits.`,
    firstMessage: 'Hello! I am your virtual HR assistant. What policy or benefits question can I help you with?',
  },
];

const DEFAULT_AGENT: Omit<Agent, 'id' | 'name'> = {
  trainingFile: 'Select Files',
  temperature: 0.7,
  maxTokens: 250,
  detectEmotion: false,
  firstMessage: 'Hello! How can I help you today?',
  systemPrompt: 'You are a helpful AI assistant. Answer the customer queries politely and guide them properly.',
  voiceName: 'Natasha - Valley girl',
  language: 'English',
  voiceModel: 'ElevenLabs Turbo v2 (english only)',
  backgroundSound: 'Default',
  patienceLevel: 'Low (1-2sec)',
  voicePrompting: 'Natasha speaks with a lively, friendly Valley girl accent. Keep responses concise and positive.',
  liveFunctions: 'Live',
  toolFunctions: 'None',
  predefinedFunctions: {
    enableEndCall: false,
    dialKeypad: false,
    forwardingNumber: '',
    endCallPhrase: '',
  },
  customFunctions: [],
};

export default function AgentsPage() {
  // Page states: 'welcome' | 'create' | 'editor'
  const [viewState, setViewState] = useState<'welcome' | 'create' | 'editor'>('welcome');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  
  // Creation inputs
  const [newAgentName, setNewAgentName] = useState('');
  
  // Editor tabs: 'model' | 'voice' | 'functions' | 'advanced'
  const [activeTab, setActiveTab] = useState<'model' | 'voice' | 'functions' | 'advanced'>('model');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Talk modal / chat states
  const [isTalkModalOpen, setIsTalkModalOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Custom Function modal
  const [isCustomFunctionModalOpen, setIsCustomFunctionModalOpen] = useState(false);
  const [customFnName, setCustomFnName] = useState('');
  const [customFnDesc, setCustomFnDesc] = useState('');
  const [customFnParams, setCustomFnParams] = useState('');

  // Voice playback simulation state
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  // Success toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('groundeddesk_custom_agents');
      if (saved) {
        const parsed = JSON.parse(saved);
        setAgents(parsed);
        if (parsed.length > 0) {
          setSelectedAgentId(parsed[0].id);
          setViewState('editor');
        }
      }
    } catch (e) {
      console.error('Failed to load agents from localStorage', e);
    }
  }, []);

  // Save to localStorage
  const saveAgentsToStorage = (updated: Agent[]) => {
    try {
      localStorage.setItem('groundeddesk_custom_agents', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save agents to localStorage', e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Create handler
  const handleCreateAgent = (templateId?: string) => {
    const name = newAgentName.trim() || (templateId ? `${TEMPLATES.find(t => t.id === templateId)?.name} Agent` : 'Custom Agent 01');
    const template = TEMPLATES.find(t => t.id === templateId);

    const newAgent: Agent = {
      id: crypto.randomUUID(),
      name,
      templateName: template ? template.name : 'Custom Starter',
      trainingFile: DEFAULT_AGENT.trainingFile,
      temperature: template ? 0.6 : DEFAULT_AGENT.temperature,
      maxTokens: DEFAULT_AGENT.maxTokens,
      detectEmotion: DEFAULT_AGENT.detectEmotion,
      firstMessage: template ? template.firstMessage : DEFAULT_AGENT.firstMessage,
      systemPrompt: template ? template.systemPrompt : DEFAULT_AGENT.systemPrompt,
      voiceName: DEFAULT_AGENT.voiceName,
      language: DEFAULT_AGENT.language,
      voiceModel: DEFAULT_AGENT.voiceModel,
      backgroundSound: DEFAULT_AGENT.backgroundSound,
      patienceLevel: DEFAULT_AGENT.patienceLevel,
      voicePrompting: DEFAULT_AGENT.voicePrompting,
      liveFunctions: DEFAULT_AGENT.liveFunctions,
      toolFunctions: DEFAULT_AGENT.toolFunctions,
      predefinedFunctions: { ...DEFAULT_AGENT.predefinedFunctions },
      customFunctions: [],
    };

    const updated = [...agents, newAgent];
    setAgents(updated);
    saveAgentsToStorage(updated);
    setSelectedAgentId(newAgent.id);
    setNewAgentName('');
    setViewState('editor');
    showToast(`Agent "${newAgent.name}" created successfully!`);
  };

  // Get current selected agent
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Update handler
  const handleUpdateAgentField = (field: keyof Agent, value: any) => {
    if (!selectedAgentId) return;
    const updated = agents.map(a => {
      if (a.id === selectedAgentId) {
        return { ...a, [field]: value };
      }
      return a;
    });
    setAgents(updated);
  };

  const handleUpdateNestedField = (nestedKey: 'predefinedFunctions', field: string, value: any) => {
    if (!selectedAgentId || !selectedAgent) return;
    const updated = agents.map(a => {
      if (a.id === selectedAgentId) {
        return {
          ...a,
          [nestedKey]: {
            ...a[nestedKey],
            [field]: value
          }
        };
      }
      return a;
    });
    setAgents(updated);
  };

  const handleSaveChanges = () => {
    saveAgentsToStorage(agents);
    showToast('Agent configurations saved successfully!');
  };

  const handleDeleteAgent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = agents.filter(a => a.id !== id);
    setAgents(updated);
    saveAgentsToStorage(updated);
    if (updated.length > 0) {
      setSelectedAgentId(updated[0].id);
    } else {
      setSelectedAgentId(null);
      setViewState('welcome');
    }
    showToast('Agent deleted.');
  };

  // Add Custom Function
  const handleAddCustomFunction = () => {
    if (!customFnName.trim() || !selectedAgent) return;
    const newFn: CustomFunction = {
      name: customFnName.trim(),
      description: customFnDesc.trim(),
      parameters: customFnParams.trim() || '{}',
    };

    const updated = agents.map(a => {
      if (a.id === selectedAgentId) {
        return {
          ...a,
          customFunctions: [...a.customFunctions, newFn]
        };
      }
      return a;
    });
    setAgents(updated);
    setCustomFnName('');
    setCustomFnDesc('');
    setCustomFnParams('');
    setIsCustomFunctionModalOpen(false);
    showToast('Custom function added!');
  };

  // Talk logic
  const handleOpenTalkModal = () => {
    if (!selectedAgent) return;
    setChatMessages([{ role: 'assistant', text: selectedAgent.firstMessage }]);
    setIsTalkModalOpen(true);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !selectedAgent) return;
    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsTalking(true);

    // Mock API reply delay
    setTimeout(() => {
      let reply = '';
      if (selectedAgent.templateName?.includes('Support')) {
        reply = `I understand you have questions. Based on my configuration, let me assist you with that request. Can you provide more details?`;
      } else if (selectedAgent.templateName?.includes('Appointment')) {
        reply = `Sure! I can check availability for that. Would you prefer morning or afternoon?`;
      } else {
        reply = `Hello! I am ${selectedAgent.name}. I received your message: "${userMsg}". How else can I assist you under my instruction?`;
      }
      setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      setIsTalking(false);

      // Play synthesized audio if enabled/simulated
      if (isPlayingVoice) {
        speakMockText(reply);
      }
    }, 1500);
  };

  const speakMockText = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      // Try to select a female voice for Natasha
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Zira') || v.name.includes('Natural'));
      if (femaleVoice) utterance.voice = femaleVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleVoiceListenSim = () => {
    if (isPlayingVoice) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingVoice(false);
    } else {
      setIsPlayingVoice(true);
      if (chatMessages.length > 0) {
        speakMockText(chatMessages[chatMessages.length - 1].text);
      }
    }
  };

  const handleSimulateListen = () => {
    setIsListening(true);
    setTimeout(() => {
      setIsListening(false);
      setChatInput('Can you tell me more about your pricing options?');
    }, 2000);
  };

  // Filtered Agents
  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="absolute inset-0 bg-[#f4f2ff] overflow-y-auto text-slate-800 p-6 flex flex-col font-sans">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#7C3AED] text-white px-4 py-3 rounded-xl shadow-lg border border-purple-400 animate-slide-up">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* VIEW 1: WELCOME SCREEN */}
      {viewState === 'welcome' && (
        <div className="flex-1 flex flex-col items-center justify-center py-10">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-sm border border-slate-200 flex flex-col items-center text-center">
            {/* Custom Profile Icon */}
            <div className="w-20 h-20 rounded-full bg-[#EEE8F8] border border-purple-200 flex items-center justify-center mb-6">
              <Bot className="w-10 h-10 text-[#7C3AED]" />
            </div>

            <span className="text-[#9E9CAE] font-medium text-xs uppercase tracking-wider mb-2">Agent Flow</span>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome{(() => { try { const u = JSON.parse(localStorage.getItem('gd_user') || '{}'); return u.name ? `, ${u.name.split(' ')[0]}` : ''; } catch { return ''; } })()} 👋</h1>
            <p className="text-slate-500 text-sm mb-8">
              Let's Create New Agents to automate call handling, customer support, and sales outreach.
            </p>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => setViewState('create')}
                className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-3 rounded-xl font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create Agent
              </button>
              <a
                href="https://ai.google.dev/gemini-api/docs"
                target="_blank"
                rel="noreferrer"
                className="w-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 py-3 rounded-xl font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" /> Documentation
              </a>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: TEMPLATE SELECTOR */}
      {viewState === 'create' && (
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Agents</h1>
              <p className="text-slate-500 text-xs mt-1">Get started with a custom configuration or template.</p>
            </div>
            <button
              onClick={() => agents.length > 0 ? setViewState('editor') : setViewState('welcome')}
              className="text-slate-500 hover:text-slate-800 font-medium text-sm flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create Agent Left Column */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
              <h2 className="text-base font-bold text-slate-800">Create Agent</h2>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Agent Name</label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Type Name"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 focus:border-[#7C3AED] bg-slate-50"
                />
                <span className="text-[10px] text-slate-400">This can be adjusted at any time after creation</span>
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400">Or</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div
                onClick={() => handleCreateAgent()}
                className="group border border-slate-200 hover:border-[#7C3AED]/40 hover:bg-[#FDFBFF] rounded-xl p-4 transition-all cursor-pointer flex flex-col gap-2.5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-[#EEE8F8] flex items-center justify-center transition-colors">
                    <Sparkles className="w-5 h-5 text-slate-500 group-hover:text-[#7C3AED]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-700 group-hover:text-slate-900">Custom Starter</h3>
                    <span className="text-[10px] text-slate-400">Build from scratch</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  A minimalist starting point with basic configuration, assigned for crafting your unique assistant.
                </p>
              </div>
            </div>

            {/* Choose Templates Right Column */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
              <h2 className="text-base font-bold text-slate-800">Choose Templates</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="border border-slate-200 rounded-xl p-4 hover:shadow-sm hover:border-[#7C3AED]/30 transition-all flex flex-col justify-between text-left h-[155px]"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className={`w-9 h-9 rounded-lg ${tpl.iconBg} flex items-center justify-center`}>
                          <Bot className={`w-4 h-4 ${tpl.iconColor.split(' ')[0]}`} />
                        </div>
                        <h3 className="font-bold text-sm text-slate-800">{tpl.name}</h3>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleCreateAgent(tpl.id)}
                      className="text-[#7C3AED] hover:text-[#6D28D9] font-bold text-xs flex items-center gap-1 mt-3 cursor-pointer self-start"
                    >
                      Try Now &gt;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MULTI-PANE AGENT EDITOR */}
      {viewState === 'editor' && selectedAgent && (
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Agents</h1>
              <p className="text-slate-500 text-xs mt-1">Configure system models, voice settings, and actions.</p>
            </div>
            <button
              onClick={() => setViewState('create')}
              className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create New Agent
            </button>
          </div>

          {/* Editor Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Sidebar list of agents (All Agents) */}
            <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">All Agents</h2>
                <button
                  onClick={() => setViewState('create')}
                  className="p-1 rounded bg-[#EEE8F8] text-[#7C3AED] hover:bg-purple-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#7C3AED] focus:border-[#7C3AED]"
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[450px]">
                {filteredAgents.length === 0 ? (
                  <div className="text-center text-slate-400 text-xs py-8">No agents found</div>
                ) : (
                  filteredAgents.map(a => (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAgentId(a.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${
                        selectedAgentId === a.id
                          ? 'bg-[#7C3AED] text-white shadow-sm shadow-[#7C3AED]/20'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Bot className={`w-4.5 h-4.5 ${selectedAgentId === a.id ? 'text-white' : 'text-slate-400'}`} />
                        <div className="truncate text-left">
                          <p className="text-xs font-bold truncate">{a.name}</p>
                          <span className={`text-[9px] block ${selectedAgentId === a.id ? 'text-purple-200' : 'text-slate-400'}`}>
                            {a.templateName || 'Custom Starter'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDeleteAgent(a.id, e)}
                        className={`p-1 rounded transition-colors ${
                          selectedAgentId === a.id
                            ? 'text-purple-200 hover:text-white hover:bg-purple-600/50'
                            : 'text-slate-400 hover:text-red-500 hover:bg-slate-100'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Progress/Upgrade Plan widget */}
              <div className="mt-auto pt-4 border-t border-slate-100">
                <div className="bg-[#FAF9FF] border border-purple-100 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-[#7C3AED]">Ignite</span>
                    <span className="text-slate-400">1,000 Credit Left</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-500 to-[#7C3AED] h-full w-[45%] rounded-full"></div>
                  </div>
                  <button className="w-full text-center text-[#7C3AED] hover:text-[#6D28D9] font-bold text-[10px] mt-1 cursor-pointer">
                    Upgrade Plan
                  </button>
                </div>
              </div>
            </aside>

            {/* Main Config Panel */}
            <main className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              {/* Panel Header */}
              <header className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-800">{selectedAgent.name}</h2>
                  </div>
                  <span className="text-xs text-slate-400">
                    {selectedAgent.language} · {selectedAgent.voiceName}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenTalkModal}
                    className="border border-[#7C3AED] hover:bg-[#7C3AED]/5 text-[#7C3AED] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" /> Talk with your Agent
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </header>

              {/* Tabs */}
              <nav className="flex px-6 border-b border-slate-100 gap-6">
                {(['model', 'voice', 'functions', 'advanced'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3 text-xs font-bold uppercase tracking-wider relative transition-colors cursor-pointer ${
                      activeTab === tab ? 'text-[#7C3AED]' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C3AED] rounded-full" />
                    )}
                  </button>
                ))}
              </nav>

              {/* Form Content */}
              <div className="flex-1 p-6 overflow-y-auto text-left">
                
                {/* TAB 1: MODEL */}
                {activeTab === 'model' && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Left model configs */}
                    <div className="md:col-span-4 flex flex-col gap-5">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Training</label>
                        <select
                          value={selectedAgent.trainingFile}
                          onChange={(e) => handleUpdateAgentField('trainingFile', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50 text-slate-700"
                        >
                          <option>Select Files</option>
                          <option value="Pricing.pdf">Pricing.pdf</option>
                          <option value="SupportDocs.md">SupportDocs.md</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Temperature</label>
                          <span className="text-xs font-bold text-[#7C3AED]">{selectedAgent.temperature}</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.1"
                          value={selectedAgent.temperature}
                          onChange={(e) => handleUpdateAgentField('temperature', parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#7C3AED]"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Max Tokens</label>
                        <input
                          type="number"
                          value={selectedAgent.maxTokens}
                          onChange={(e) => handleUpdateAgentField('maxTokens', parseInt(e.target.value) || 250)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50 text-slate-700"
                        />
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block">Detect Emotion</label>
                          <span className="text-[10px] text-slate-400 block mt-0.5">Adapt tone dynamically</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAgent.detectEmotion}
                            onChange={(e) => handleUpdateAgentField('detectEmotion', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7C3AED]"></div>
                        </label>
                      </div>
                    </div>

                    {/* Right textareas */}
                    <div className="md:col-span-8 flex flex-col gap-5">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">First Message</label>
                        <input
                          type="text"
                          value={selectedAgent.firstMessage}
                          onChange={(e) => handleUpdateAgentField('firstMessage', e.target.value)}
                          placeholder="Welcome greeting..."
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50 text-slate-700"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Prompt</label>
                        <textarea
                          rows={10}
                          value={selectedAgent.systemPrompt}
                          onChange={(e) => handleUpdateAgentField('systemPrompt', e.target.value)}
                          placeholder="Enter instructions..."
                          className="w-full p-3 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50 text-slate-700 leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: VOICE */}
                {activeTab === 'voice' && (
                  <div className="flex flex-col gap-6">
                    {/* Voice Card Natasha */}
                    <div className="border border-slate-200 bg-[#FAF9FF] rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#EEE8F8] flex items-center justify-center">
                          <Volume2 className="w-5 h-5 text-[#7C3AED]" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">{selectedAgent.voiceName}</h3>
                          <span className="text-[10px] text-slate-400">Google Gemini Text-to-Speech Engine</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleVoiceListenSim}
                          className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-[#7C3AED]" /> Listen
                        </button>
                        <button className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 cursor-pointer transition-colors">
                          Edit
                        </button>
                      </div>
                    </div>

                    {isPlayingVoice && (
                      <div className="bg-[#EEE8F8]/40 border border-purple-100 rounded-xl p-3 flex items-center justify-between text-xs text-purple-700 animate-pulse">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Playing Natasha - Valley girl preview audio...
                        </span>
                        <button
                          onClick={() => {
                            if (typeof window !== 'undefined') window.speechSynthesis.cancel();
                            setIsPlayingVoice(false);
                          }}
                          className="text-purple-900 hover:text-purple-600 font-bold"
                        >
                          Stop
                        </button>
                      </div>
                    )}

                    {/* Advance configurations grid */}
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Advance Configuration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Language</label>
                          <select
                            value={selectedAgent.language}
                            onChange={(e) => handleUpdateAgentField('language', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                          >
                            <option value="English">English</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Voice Model</label>
                          <select
                            value={selectedAgent.voiceModel}
                            onChange={(e) => handleUpdateAgentField('voiceModel', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                          >
                            <option value="ElevenLabs Turbo v2 (english only)">ElevenLabs Turbo v2 (english only)</option>
                            <option value="Google Cloud TTS (Standard)">Google Cloud TTS (Standard)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Background Sound</label>
                          <select
                            value={selectedAgent.backgroundSound}
                            onChange={(e) => handleUpdateAgentField('backgroundSound', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                          >
                            <option value="Default">Default</option>
                            <option value="Office Hum">Office Hum</option>
                            <option value="None">None</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Patience Level</label>
                          <select
                            value={selectedAgent.patienceLevel}
                            onChange={(e) => handleUpdateAgentField('patienceLevel', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                          >
                            <option value="Low (1-2sec)">Low (1-2sec)</option>
                            <option value="Medium (3-4sec)">Medium (3-4sec)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Voice prompting */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voice Prompting</label>
                      <textarea
                        rows={4}
                        value={selectedAgent.voicePrompting}
                        onChange={(e) => handleUpdateAgentField('voicePrompting', e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700 leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 3: FUNCTIONS */}
                {activeTab === 'functions' && (
                  <div className="flex flex-col gap-6">
                    {/* Live & Tool lists */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Live Functions</label>
                        <select
                          value={selectedAgent.liveFunctions}
                          onChange={(e) => handleUpdateAgentField('liveFunctions', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                        >
                          <option value="Live">Live</option>
                          <option value="Disabled">Disabled</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tool Functions</label>
                        <select
                          value={selectedAgent.toolFunctions}
                          onChange={(e) => handleUpdateAgentField('toolFunctions', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                        >
                          <option value="None">None</option>
                          <option value="CRM Integration">CRM Integration</option>
                        </select>
                      </div>
                    </div>

                    {/* Predefined functions panel */}
                    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Predefined Functions</h3>

                      <div className="space-y-4">
                        {/* Switch 1: End Call */}
                        <div className="flex items-start justify-between">
                          <div className="max-w-[80%]">
                            <span className="text-xs font-bold text-slate-700 block">Enable End Call Function</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              This will allow the assistant to end the call when client says it is done or no longer responds.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer mt-1">
                            <input
                              type="checkbox"
                              checked={selectedAgent.predefinedFunctions.enableEndCall}
                              onChange={(e) => handleUpdateNestedField('predefinedFunctions', 'enableEndCall', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7C3AED]"></div>
                          </label>
                        </div>

                        {/* Switch 2: Dial Keypad */}
                        <div className="flex items-start justify-between border-t border-slate-100 pt-3">
                          <div className="max-w-[80%]">
                            <span className="text-xs font-bold text-slate-700 block">Dial Keypad</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Control whether the assistant can dial digits on the keypad.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer mt-1">
                            <input
                              type="checkbox"
                              checked={selectedAgent.predefinedFunctions.dialKeypad}
                              onChange={(e) => handleUpdateNestedField('predefinedFunctions', 'dialKeypad', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7C3AED]"></div>
                          </label>
                        </div>

                        {/* Input 1: Forwarding number */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-3 gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-700 block">Forwarding Phone Number</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">Define forwarding number when routing to human support.</p>
                          </div>
                          <input
                            type="text"
                            placeholder="+17036495817"
                            value={selectedAgent.predefinedFunctions.forwardingNumber}
                            onChange={(e) => handleUpdateNestedField('predefinedFunctions', 'forwardingNumber', e.target.value)}
                            className="w-full sm:w-60 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#7C3AED] text-slate-700"
                          />
                        </div>

                        {/* Input 2: End call phrase */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-3 gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-700 block">End Call Phrase</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">Custom word or phrase to trigger call termination.</p>
                          </div>
                          <input
                            type="text"
                            placeholder="Goodbye, talk to you soon"
                            value={selectedAgent.predefinedFunctions.endCallPhrase}
                            onChange={(e) => handleUpdateNestedField('predefinedFunctions', 'endCallPhrase', e.target.value)}
                            className="w-full sm:w-60 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#7C3AED] text-slate-700"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Custom functions list */}
                    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Custom Functions</h3>
                        <button
                          onClick={() => setIsCustomFunctionModalOpen(true)}
                          className="text-[#7C3AED] hover:text-[#6D28D9] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Create New Function
                        </button>
                      </div>

                      {selectedAgent.customFunctions.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No custom functions defined for this assistant.</p>
                      ) : (
                        <div className="space-y-3">
                          {selectedAgent.customFunctions.map((fn, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-start justify-between">
                              <div>
                                <span className="text-xs font-mono font-bold text-slate-700">{fn.name}()</span>
                                <p className="text-[10px] text-slate-500 mt-1">{fn.description}</p>
                                <pre className="text-[9px] font-mono text-slate-400 mt-1 bg-slate-950 p-2 rounded max-w-full overflow-x-auto">
                                  {fn.parameters}
                                </pre>
                              </div>
                              <button
                                onClick={() => {
                                  const updated = selectedAgent.customFunctions.filter((_, i) => i !== idx);
                                  handleUpdateAgentField('customFunctions', updated);
                                  showToast('Custom function removed.');
                                }}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 4: ADVANCED */}
                {activeTab === 'advanced' && (
                  <div className="flex flex-col gap-5">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">System Settings</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Confidence Threshold</label>
                        <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700">
                          <option>0.7 (Default)</option>
                          <option>0.8 (Strict)</option>
                          <option>0.6 (Lenient)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Timeout Duration (seconds)</label>
                        <input
                          type="number"
                          defaultValue={30}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custom Webhook Callback</label>
                      <input
                        type="text"
                        placeholder="https://api.yourdomain.com/v1/webhook"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none bg-slate-50 text-slate-700"
                      />
                    </div>
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      )}

      {/* MODAL 1: TALK WITH YOUR AGENT */}
      {isTalkModalOpen && selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg h-[550px] shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-slide-up mx-4">
            
            {/* Header */}
            <header className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedAgent.name}</h3>
                  <span className="text-[10px] text-slate-400">Testing Environment</span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') window.speechSynthesis.cancel();
                  setIsTalkModalOpen(false);
                }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Chat Body */}
            <div className="flex-grow p-4 overflow-y-auto space-y-3 flex flex-col">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white self-end rounded-tr-none'
                      : 'bg-slate-800 text-slate-200 self-start rounded-tl-none border border-slate-700/50'
                  }`}
                >
                  {msg.text}
                </div>
              ))}

              {isTalking && (
                <div className="bg-slate-800 text-slate-400 self-start text-xs rounded-2xl p-3 border border-slate-700/50 rounded-tl-none animate-pulse flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
                </div>
              )}
            </div>

            {/* Simulated Microphone / Listen Actions */}
            <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleVoiceListenSim}
                  className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 ${
                    isPlayingVoice
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Simulate Speech Synthesis Voice Output"
                >
                  {isPlayingVoice ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{isPlayingVoice ? 'Voice ON' : 'Voice OFF'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSimulateListen}
                  disabled={isListening}
                  className={`px-3 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg text-slate-300 flex items-center gap-1 cursor-pointer disabled:opacity-40`}
                >
                  {isListening ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3 text-[#7C3AED]" />}
                  <span>{isListening ? 'Listening...' : 'Simulate Talk'}</span>
                </button>
              </div>
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex gap-2">
              <input
                type="text"
                placeholder="Type your message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-grow px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isTalking}
                className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all shadow-md shadow-purple-900/30 disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CUSTOM FUNCTION EDITOR */}
      {isCustomFunctionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 text-slate-800 animate-slide-up mx-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">Create New Custom Function</h3>
              <button onClick={() => setIsCustomFunctionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-500">Function Name</label>
                <input
                  type="text"
                  placeholder="e.g. checkAccountBalance"
                  value={customFnName}
                  onChange={(e) => setCustomFnName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-500">Description</label>
                <textarea
                  rows={2}
                  placeholder="Explain what this function does for the agent model..."
                  value={customFnDesc}
                  onChange={(e) => setCustomFnDesc(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-slate-500">Parameters Schema (JSON)</label>
                <textarea
                  rows={4}
                  placeholder='{"type": "object", "properties": {"accountId": {"type": "string"}}}'
                  value={customFnParams}
                  onChange={(e) => setCustomFnParams(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] bg-slate-50"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => setIsCustomFunctionModalOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomFunction}
                className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                Create Function
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
