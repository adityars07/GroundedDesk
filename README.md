# GroundedDesk

> An eval-driven, multi-tenant AI customer-support SaaS that businesses embed on their site to answer customer questions from their own knowledge base.

**Built with measurable RAG quality, tenant-isolated data, and production-grade observability.**

## 🏗 Architecture

```
Customer → Widget (React) → WebSocket → NestJS Gateway
   → Auth + tenant resolution
   → Retrieval: Qdrant (tenant-isolated) + reranker
   → Guardrails: prompt-injection check, PII scrub
   → LLM (OpenAI) with grounded prompt + citations
   → Stream tokens back over WebSocket
   → Langfuse trace + cost logged to Postgres
   → If confidence < threshold → suggest human handoff
```

## 📦 Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 15, TypeScript, Tailwind, shadcn/ui | Industry-standard, fast iteration |
| Backend | NestJS 11 (Node + TS) | Modules + DI scale for multi-tenant logic |
| Database | PostgreSQL 16 (Neon) | RLS for tenant isolation |
| Queues | Redis + BullMQ | Standard for async ingestion |
| Vectors | Qdrant | Payload-based tenant isolation, production-grade |
| LLM | OpenAI (GPT-4o) | Primary provider |
| Realtime | Socket.io | Streaming + bidirectional communication |
| Observability | Langfuse | Open-source traces + cost tracking |
| Auth | Auth.js v5 + JWT | Google OAuth + magic link |

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose

### Setup

```bash
# Clone the repo
git clone https://github.com/adityars07/Pulse.git
cd Pulse

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, Qdrant)
docker compose -f docker/docker-compose.yml up -d

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Run database migrations
pnpm --filter api prisma migrate dev

# Start development
pnpm dev
```

## 📁 Project Structure

```
groundeddesk/
├── apps/
│   ├── web/          # Next.js admin dashboard
│   ├── api/          # NestJS backend API
│   └── widget/       # Embeddable chat widget
├── packages/
│   ├── shared-types/ # Shared TypeScript interfaces
│   ├── tsconfig/     # Shared TypeScript configs
│   └── eslint-config/# Shared ESLint config
├── docker/           # Docker Compose for local dev
├── docs/             # Technical documentation
└── eval/             # RAG evaluation harness
```

## 📊 RAG Evaluation Results

> Coming soon — eval harness is part of the v1 deliverables.

| Metric | Score | Target |
|--------|-------|--------|
| Retrieval Precision@5 | — | > 0.75 |
| Faithfulness | — | > 0.85 |
| Answer Relevance | — | > 0.80 |
| Hallucination Rate | — | < 10% |

## 🔒 Multi-Tenancy

- PostgreSQL Row-Level Security (RLS) policies on every tenant-scoped table
- Qdrant payload-based isolation with indexed `tenant_id` field
- API key scoping per tenant
- Full threat model in [`docs/multi-tenancy.md`](./docs/multi-tenancy.md)

## 📄 License

MIT
