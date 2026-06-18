// ============================================================
// GroundedDesk — Shared Type Definitions
// ============================================================

// ── Tenant ──────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  widgetColor?: string;
  widgetPosition?: 'bottom-right' | 'bottom-left';
  welcomeMessage?: string;
  confidenceThreshold?: number;
  maxTokensPerResponse?: number;
}

// ── User ────────────────────────────────────────────────────

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatar: string | null;
  createdAt: Date;
}

// ── Knowledge Source ────────────────────────────────────────

export enum SourceType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  MARKDOWN = 'MARKDOWN',
  URL = 'URL',
}

export enum SourceStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export interface KnowledgeSource {
  id: string;
  tenantId: string;
  type: SourceType;
  name: string;
  status: SourceStatus;
  metadata: Record<string, unknown>;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Chunk ───────────────────────────────────────────────────

export interface Chunk {
  id: string;
  sourceId: string;
  tenantId: string;
  content: string;
  tokenCount: number;
  metadata: ChunkMetadata;
  vectorId: string;
  createdAt: Date;
}

export interface ChunkMetadata {
  pageNumber?: number;
  sectionHeading?: string;
  sourceName: string;
  sourceType: SourceType;
}

// ── Conversation ────────────────────────────────────────────

export enum ConversationStatus {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export interface Conversation {
  id: string;
  tenantId: string;
  sessionId: string;
  visitorInfo: VisitorInfo;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorInfo {
  ip?: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
}

// ── Message ─────────────────────────────────────────────────

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  SYSTEM = 'SYSTEM',
}

export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  confidence: number | null;
  tokenCost: number | null;
  latencyMs: number | null;
  createdAt: Date;
}

export interface Citation {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  content: string;
  relevanceScore: number;
}

// ── API Key ─────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string; // first 8 chars for display
  lastUsedAt: Date | null;
  createdAt: Date;
}

// ── Cost Log ────────────────────────────────────────────────

export interface CostLog {
  id: string;
  tenantId: string;
  conversationId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  createdAt: Date;
}

// ── WebSocket Events ────────────────────────────────────────

export interface ChatMessagePayload {
  text: string;
  conversationId?: string;
}

export interface ChatTokenPayload {
  text: string;
  index: number;
}

export interface ChatDonePayload {
  messageId: string;
  citations: Citation[];
  confidence: number;
  conversationId: string;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
}

// ── Eval Types ──────────────────────────────────────────────

export interface EvalTestCase {
  question: string;
  groundTruth: string;
  expectedSource?: string;
}

export interface EvalResult {
  testCase: EvalTestCase;
  retrievedChunks: string[];
  generatedAnswer: string;
  metrics: EvalMetrics;
}

export interface EvalMetrics {
  faithfulness: number;
  contextPrecision: number;
  answerRelevance: number;
  hallucinationRate: number;
}
