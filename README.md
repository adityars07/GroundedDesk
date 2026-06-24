# GroundedDesk — Eval-Driven, Multi-Tenant AI Support Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.0-red.svg)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15.0-black.svg)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Postgres-16-blue.svg)](https://www.postgresql.org/)
[![Vectors](https://img.shields.io/badge/Qdrant-1.13-orange.svg)](https://qdrant.tech/)
[![Evaluation](https://img.shields.io/badge/RAG_Quality-95%25-green.svg)](./docs/rag-evaluation.md)

GroundedDesk is a multi-tenant AI customer-support SaaS that businesses embed on their websites to answer customer questions dynamically from their own knowledge bases. 

Unlike typical "PDF-in, answers-out" wrappers, GroundedDesk is engineered with:
1. **Measured RAG quality** (faithfulness, context precision, answer relevance, and hallucination rates) using LLM-as-a-judge evals.
2. **Production-grade multi-tenancy** enforced via PostgreSQL Row-Level Security (RLS) and indexed vector database namespace payloads.
3. **Robust guardrails** against prompt injections, PII leakage, and low-confidence answers.
4. **Complete observability** with Langfuse request tracing, token cost logs, and real-time dashboard analytics.

---

## 🏗 Architecture & Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as End Customer
    participant Widget as Chat Widget (Shadow DOM)
    participant Nest as NestJS API Gateway
    participant Guard as Guardrails Module
    participant Qdrant as Qdrant Vector DB
    participant LLM as Google Gemini (gemini-1.5-flash)
    participant DB as PostgreSQL (RLS)
    participant Obs as Langfuse (Observability)

    Customer->>Widget: Input question
    Widget->>Nest: Send message over WebSockets (Socket.io)
    Note over Nest: Middleware validates API Key Prefix<br/>Resolves Tenant ID Context
    Nest->>Obs: Start trace (tenant, conversation, session)
    Nest->>Guard: Run prompt injection filter
    alt Prompt Injection Detected
        Nest-->>Widget: Emit error (Blocked)
    end
    Nest->>Guard: Redact PII from user query
    Nest->>LLM: Generate query embedding (gemini-embedding-001)
    LLM-->>Nest: Query vector
    Nest->>Qdrant: Search (restricted by tenant_id payload filter)
    Qdrant-->>Nest: Retrieve top relevance chunks
    Nest->>Nest: Rerank chunks (top relevance)
    Nest->>LLM: Stream completions (System Prompt + Chunks + History)
    loop Token Stream
        LLM-->>Nest: Emit token
        Nest-->>Widget: Emit token (Typing animation)
    end
    LLM-->>Nest: Final completions & confidence score [0-1]
    Nest->>Guard: Check confidence threshold (e.g. 0.6)
    alt Confidence below threshold
        Nest-->>Widget: Suggest human handoff alert
    end
    Nest->>DB: Save assistant message + citations (bypasses RLS only with active tenant scope)
    Nest->>DB: Log tokens, latency, and costs to Postgres
    Nest->>Obs: End trace (latency, tokens, cost)
    Nest-->>Widget: Emit done (Citations cards & message ID)
```

---

## 📦 Tech Stack

- **Monorepo Engine**: [Turborepo](https://turbo.build/repo) + [pnpm Workspaces](https://pnpm.io/)
- **Frontend Admin Panel**: Next.js 15 (App Router, Tailwind CSS, shadcn/ui, Recharts, TanStack Query)
- **Backend API Server**: NestJS 11 (REST API, Socket.io WebSockets, BullMQ background queues)
- **LLM Engine**: Google Gemini (`gemini-1.5-flash` for completions/guardrails, `gemini-embedding-001` or `text-embedding-004` for embeddings)
- **Database**: PostgreSQL 16 (Prisma ORM) with Row-Level Security (RLS) Policies
- **Vector Search Engine**: Qdrant (payload-based keyword multi-tenant isolation with 768-dimension vectors)
- **Ingestion Workers**: Redis (BullMQ queue broker) + Cheerio/Mammoth/pdf-parse (crawlers and parsers)
- **Observability Tracing**: Langfuse + Local Postgres Cost Log Trackers
- **Authentication**: NextAuth.js v5 (JWT-based session propagation to backend APIs)

---

## 📁 Monorepo Layout

```
groundeddesk/
├── apps/
│   ├── api/             # NestJS 11 backend server
│   ├── web/             # Next.js 15 admin dashboard panel
│   └── widget/          # Embeddable shadow-DOM React chat widget
├── packages/
│   ├── shared-types/    # Shared TypeScript contracts and types
│   ├── tsconfig/        # Reusable tsconfig compiler configurations
│   └── eslint-config/   # Shared code formatting/eslint policies
├── docker/              # Docker infrastructure (Postgres, Redis, Qdrant)
├── docs/                # System documentation (RLS Threat Model & RAG Evals)
└── eval/                # Standalone RAG evaluation harness & test cases
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** >= 20
- **pnpm** >= 10
- **Docker & Docker Compose**

### 2. Initial Setup
Clone the repository and install the monorepo dependencies:
```bash
git clone https://github.com/adityars07/Pulse.git
cd Pulse
pnpm install
```

### 3. Start Infrastructure
Launch Postgres, Redis, and Qdrant locally:
```bash
docker compose -f docker/docker-compose.yml up -d
```

### 4. Setup Environment Files
Copy the template variables into your projects:
```bash
# Root directory
cp .env.example .env

# Backend API
cp .env.example apps/api/.env

# RAG Eval Harness
cp .env.example eval/.env
```
*Make sure to open the `.env` files and paste your `GEMINI_API_KEY` and set `VECTOR_SIZE=768`.*

### 5. Run Database Migrations & Seed Data
Generate Prisma clients, apply SQL Row-Level Security migrations, and seed the demo dataset:
```bash
# Apply RLS schema migrations
pnpm --filter @groundeddesk/api exec prisma migrate dev

# Seed database and vectors (Creates Acme Coffee Co. demo tenant, admin account, API keys, and metrics history)
pnpm --filter @groundeddesk/api exec prisma db seed
```

### 6. Start Development Servers
Run the NestJS backend, Next.js admin portal, and widget builder simultaneously:
```bash
pnpm dev
```
- **Admin Dashboard**: `http://localhost:3000` (Login: `admin@acmecoffee.com` / `Password123!`)
- **Backend API**: `http://localhost:4000`
- **Widget Development Server**: `http://localhost:3001`

---

## 📊 RAG Quality Evals

GroundedDesk measures RAG answer relevance, context precision, and factual faithfulness directly to guarantee that users do not receive hallucinations. Evals run against the standard Acme Coffee Co. dataset.

To execute the offline evaluation harness:
```bash
pnpm --filter eval run evaluate
```

### v1 Target Scorecard

| Metric | Measured Score | Target threshold | Status |
| :--- | :--- | :--- | :--- |
| **Faithfulness** | **0.95** | > 0.85 | ✅ PASS |
| **Context Precision** | **0.88** | > 0.75 | ✅ PASS |
| **Answer Relevance** | **0.90** | > 0.80 | ✅ PASS |
| **Hallucination Rate** | **5.0%** | < 10% | ✅ PASS |

See [docs/rag-evaluation.md](./docs/rag-evaluation.md) for grading prompts and detailed test case configurations.

---

## 🔒 Multi-Tenancy & Security

GroundedDesk treats tenant isolation as a core security concern rather than an application-level filter:
1. **Database Level**: Postgres Row-Level Security (RLS) filters rows using transaction-scoped session context (`app.current_tenant`). Even raw queries cannot leak cross-tenant data.
2. **Vector Level**: Qdrant vector retrieval uses keyword-based filters on the `tenant_id` payload field, preventing query embeddings from accessing outside namespaces.
3. **API Keys**: Stored securely as hashed bcrypt keys, validating client connections using unique display prefixes.

Read the complete security threat model in [docs/multi-tenancy.md](./docs/multi-tenancy.md).

---

## 📄 License

MIT
