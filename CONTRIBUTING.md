# Contributing to GroundedDesk

Thank you for contributing to GroundedDesk! This guide will help you set up your local development environment and align with our development standards.

---

## 1. Local Environment Setup

GroundedDesk is configured as a `pnpm` monorepo using Turborepo.

### Prerequisites
- **Node.js**: `v20` or higher
- **pnpm**: `v10` or higher
- **Docker & Docker Compose** (for local databases)

### Installation
1. Clone the repository and navigate to the project folder:
   ```bash
   git clone https://github.com/adityars07/Pulse.git
   cd Pulse
   ```
2. Install workspace dependencies:
   ```bash
   pnpm install
   ```

### Infrastructure Services
Start the PostgreSQL, Redis, and Qdrant containers:
```bash
docker compose -f docker/docker-compose.yml up -d
```

### Environment Variables
Copy `.env.example` to `.env` in the root and in the sub-apps:
```bash
# Root
cp .env.example .env

# Backend API
cp .env.example apps/api/.env

# Evaluation Suite
cp .env.example eval/.env
```
Fill in the `GEMINI_API_KEY` and other credentials inside the `.env` files.

### Database Migrations & Seeding
Apply database migrations and run the Acme Coffee Co. demo seed script:
```bash
# Run migrations
pnpm --filter @groundeddesk/api exec prisma migrate dev

# Run RLS SQL policies (usually automatically applied in migrations)
# Seed the database & vectors
pnpm --filter @groundeddesk/api exec prisma db seed
```

---

## 2. Command Reference

Use `pnpm` from the root directory to run scripts across the monorepo:

| Action | Command |
| :--- | :--- |
| **Start Dev Servers** | `pnpm dev` |
| **Build Codebases** | `pnpm build` |
| **Format Files** | `pnpm format` |
| **Check Formatting** | `pnpm format:check` |
| **Run Lints** | `pnpm lint` |
| **Run Typecheck** | `pnpm typecheck` |
| **Run Unit Tests** | `pnpm test` |
| **Run RLS Isolation Tests** | `pnpm --filter @groundeddesk/api test:rls` |
| **Run RAG Quality Evals** | `pnpm --filter eval run evaluate` |

---

## 3. Coding Standards

- **Formatting**: We use Prettier for auto-formatting. Run `pnpm format` before committing.
- **TypeScript**: All packages require type safety. Ensure `pnpm typecheck` compiles cleanly.
- **Fail-Closed Security**: When writing database operations, always ensure you use the `TenantAwarePrismaService` (`withTenantScope` or `withExplicitTenant`) to enforce RLS contexts unless performing system-wide admin operations.
- **Citations**: LLM responses must always output grounding references in `[Source N]` format matching retrieved chunks.

---

## 4. Git Workflow & Commits

We follow clean commit conventions. Since multi-tenancy security is critical, write descriptive commits detailing the changes.

Example:
```bash
git commit -m "feat(api): add confidence threshold refusal guardrail"
git push origin main
```
Please run the tests and verify that the build compiles successfully before pushing!
