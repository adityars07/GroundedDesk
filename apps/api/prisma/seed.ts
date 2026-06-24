import { PrismaClient, UserRole, SourceType, SourceStatus, MessageRole, ConversationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const prisma = new PrismaClient();

const TENANT_ID = 'acme-tenant-uuid-1111-2222-3333-444444444444';
const USER_ID = 'acme-user-uuid-1111-2222-3333-444444444444';
const API_KEY_ID = 'acme-key-uuid-1111-2222-3333-444444444444';
const RAW_API_KEY = 'gd_live_acmecoffeedemo1234567890abcdef';
const COLLECTION_NAME = 'groundeddesk_chunks_768';

function generateMockVector(dimensions = 768): number[] {
  const vec = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return vec.map((val) => val / magnitude);
}

async function ensureQdrantCollection(client: QdrantClient) {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

    if (!exists) {
      console.log(`Creating Qdrant collection: ${COLLECTION_NAME}`);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });

      // Create payload index on tenant_id for fast filtering
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'tenant_id',
        field_schema: {
          type: 'keyword',
          is_tenant: true,
        } as any,
      });

      // Create payload index on source_id for deletion
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'source_id',
        field_schema: 'keyword',
      });
      console.log('Qdrant collection created and indexed successfully.');
    } else {
      console.log('Qdrant collection already exists.');
    }
  } catch (error) {
    console.warn(`Warning: Could not initialize Qdrant collection: ${error}`);
  }
}

async function seed() {
  console.log('=== GroundedDesk Database & Vector Seeding ===');

  const qdrantHost = process.env.QDRANT_HOST || 'localhost';
  const qdrantPort = parseInt(process.env.QDRANT_PORT || '6333');
  console.log(`Qdrant connection configured to http://${qdrantHost}:${qdrantPort}`);

  const qdrantClient = new QdrantClient({
    host: qdrantHost,
    port: qdrantPort,
  });

  await ensureQdrantCollection(qdrantClient);

  const geminiKey = process.env.GEMINI_API_KEY;
  const isRealGeminiKey =
    geminiKey &&
    !geminiKey.startsWith('AIzaSy-placeholder') &&
    geminiKey !== '';

  let geminiClient: OpenAI | null = null;
  if (isRealGeminiKey) {
    console.log('Valid Gemini API key detected. Real embeddings will be generated.');
    geminiClient = new OpenAI({
      apiKey: geminiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  } else {
    console.log('No valid Gemini API key detected. Fallback: generating mock vectors.');
  }

  // Bypass RLS in Postgres transaction
  await prisma.$transaction(async (tx) => {
    console.log('Enabling admin bypass for RLS in PostgreSQL...');
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'true', true)`);

    // 1. Clean up existing Acme Coffee Co. tenant data to ensure re-runnability
    console.log('Cleaning up existing demo tenant data...');
    await tx.user.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.apiKey.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.chunk.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.knowledgeSource.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.message.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.conversation.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.costLog.deleteMany({ where: { tenantId: TENANT_ID } });
    await tx.tenant.deleteMany({ where: { id: TENANT_ID } });

    // 2. Create Tenant
    console.log('Seeding Tenant...');
    const tenant = await tx.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'Acme Coffee Co.',
        slug: 'acme-coffee',
        settings: {
          welcomeMessage: 'Welcome to Acme Coffee Co. Support! How can I help you today?',
          confidenceThreshold: 0.6,
          widgetColor: '#f59e0b',
          widgetPosition: 'bottom-right',
        },
      },
    });

    // 3. Create User (Owner)
    console.log('Seeding Owner User...');
    const hashedPassword = await bcrypt.hash('Password123!', 12);
    await tx.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: 'admin@acmecoffee.com',
        name: 'Acme Admin',
        role: UserRole.OWNER,
        password: hashedPassword,
        provider: 'email',
      },
    });

    // 4. Create API Key
    console.log('Seeding API Key...');
    const apiKeyHash = await bcrypt.hash(RAW_API_KEY, 10);
    const apiKeyPrefix = RAW_API_KEY.substring(0, 16); // 16-character prefix matching fix
    await tx.apiKey.create({
      data: {
        id: API_KEY_ID,
        tenantId: TENANT_ID,
        name: 'Default Live Key',
        keyHash: apiKeyHash,
        keyPrefix: apiKeyPrefix,
      },
    });

    // 5. Load & Embed KB Sources
    console.log('Loading knowledge base guide documents...');
    const kbPath = path.join(__dirname, '../../../eval/datasets/acme-kb.json');
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base dataset file not found at ${kbPath}`);
    }

    const kbItems: Array<{ sourceName: string; content: string }> = JSON.parse(
      fs.readFileSync(kbPath, 'utf8'),
    );

    const chunkIds: string[] = [];

    for (const item of kbItems) {
      console.log(`Processing source: ${item.sourceName}`);
      let sourceType: SourceType = SourceType.URL;
      if (item.sourceName.endsWith('.pdf')) {
        sourceType = SourceType.PDF;
      } else if (item.sourceName.endsWith('.md')) {
        sourceType = SourceType.MARKDOWN;
      }

      const sourceId = uuidv4();
      const chunkId = uuidv4();
      chunkIds.push(chunkId);

      // Create Knowledge Source in DB
      await tx.knowledgeSource.create({
        data: {
          id: sourceId,
          tenantId: TENANT_ID,
          type: sourceType,
          name: item.sourceName,
          status: SourceStatus.READY,
          chunkCount: 1,
        },
      });

      // Generate Embedding vector
      let vector: number[];
      if (geminiClient) {
        try {
          const response = await geminiClient.embeddings.create({
            model: 'text-embedding-004',
            input: item.content,
          });
          vector = response.data[0].embedding;
        } catch (e) {
          console.warn(`Failed to embed via Gemini, falling back to mock vector: ${e}`);
          vector = generateMockVector();
        }
      } else {
        vector = generateMockVector();
      }

      // Create Chunk in DB
      await tx.chunk.create({
        data: {
          id: chunkId,
          sourceId,
          tenantId: TENANT_ID,
          content: item.content,
          tokenCount: Math.ceil(item.content.length / 4),
          metadata: { sourceName: item.sourceName },
          vectorId: chunkId,
        },
      });

      // Upsert vector in Qdrant
      try {
        await qdrantClient.upsert(COLLECTION_NAME, {
          wait: true,
          points: [
            {
              id: chunkId,
              vector,
              payload: {
                tenant_id: TENANT_ID,
                source_id: sourceId,
                chunk_id: chunkId,
                content: item.content,
                metadata: { sourceName: item.sourceName },
              },
            },
          ],
        });
      } catch (error) {
        console.warn(`Warning: Could not upsert chunk to Qdrant collection: ${error}`);
      }
    }

    // 6. Seed Conversations & Messages History
    console.log('Seeding mock conversations & messages...');
    const conv1Id = uuidv4();
    const conv2Id = uuidv4();
    const conv3Id = uuidv4();

    // Conversation 1: High satisfaction resolved hours query
    await tx.conversation.create({
      data: {
        id: conv1Id,
        tenantId: TENANT_ID,
        sessionId: 'session_chrome_1',
        status: ConversationStatus.RESOLVED,
        rating: 5,
        visitorInfo: { browser: 'Chrome', country: 'US', os: 'macOS' },
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      },
    });

    await tx.message.createMany({
      data: [
        {
          conversationId: conv1Id,
          tenantId: TENANT_ID,
          role: MessageRole.USER,
          content: 'What are the opening hours for the downtown shop?',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000),
        },
        {
          conversationId: conv1Id,
          tenantId: TENANT_ID,
          role: MessageRole.ASSISTANT,
          content: 'The downtown shop is located at 456 Main Street and is open from 6:30 AM to 8:00 PM on weekdays (Monday through Friday), and 8:00 AM to 6:00 PM on weekends (Saturday and Sunday). [Source 1]',
          citations: [
            {
              chunkId: chunkIds[1],
              sourceName: 'acme-locations.pdf',
              content: 'The downtown shop is located at 456 Main Street and is open...',
              relevanceScore: 0.98,
            },
          ],
          confidence: 0.99,
          tokenCost: 0.0015,
          latencyMs: 380,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    // Conversation 2: Active shipping query
    await tx.conversation.create({
      data: {
        id: conv2Id,
        tenantId: TENANT_ID,
        sessionId: 'session_safari_2',
        status: ConversationStatus.ACTIVE,
        visitorInfo: { browser: 'Safari', country: 'CA', os: 'iOS' },
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
    });

    await tx.message.createMany({
      data: [
        {
          conversationId: conv2Id,
          tenantId: TENANT_ID,
          role: MessageRole.USER,
          content: 'Hi, do you offer free shipping?',
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000),
        },
        {
          conversationId: conv2Id,
          tenantId: TENANT_ID,
          role: MessageRole.ASSISTANT,
          content: 'Yes! Acme Coffee Co. offers free standard shipping on all coffee bean orders of $35 or more within the continental United States. For orders under $35, a flat shipping rate of $4.99 applies. [Source 1]',
          citations: [
            {
              chunkId: chunkIds[2],
              sourceName: 'acme-shipping-policy.md',
              content: 'Acme Coffee Co. shipping policy: We offer free standard shipping...',
              relevanceScore: 0.96,
            },
          ],
          confidence: 0.97,
          tokenCost: 0.0012,
          latencyMs: 410,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    // Conversation 3: Escalated refund dispute
    await tx.conversation.create({
      data: {
        id: conv3Id,
        tenantId: TENANT_ID,
        sessionId: 'session_firefox_3',
        status: ConversationStatus.ESCALATED,
        rating: 1,
        visitorInfo: { browser: 'Firefox', country: 'GB', os: 'Windows' },
        createdAt: new Date(), // Today
      },
    });

    await tx.message.createMany({
      data: [
        {
          conversationId: conv3Id,
          tenantId: TENANT_ID,
          role: MessageRole.USER,
          content: 'I want a refund on my subscription from last month, it was billed twice.',
          createdAt: new Date(Date.now() - 10 * 60 * 1000),
        },
        {
          conversationId: conv3Id,
          tenantId: TENANT_ID,
          role: MessageRole.ASSISTANT,
          content: "I don't have enough information to answer that question. Would you like to speak with a human agent?",
          citations: [],
          confidence: 0.12,
          tokenCost: 0.0004,
          latencyMs: 250,
          createdAt: new Date(),
        },
      ],
    });

    // 7. Seed Cost Logs for the past 7 days to populate Recharts dashboard charts
    console.log('Seeding cost logs over the past 7 days...');
    const costLogs = [];
    for (let day = 7; day >= 0; day--) {
      const date = new Date();
      date.setDate(date.getDate() - day);

      // Seed a few chat entries and embedding entries per day
      const dailyChats = Math.floor(Math.random() * 5) + 2; // 2 to 6 chats daily
      for (let c = 0; c < dailyChats; c++) {
        const promptTokens = Math.floor(Math.random() * 300) + 150;
        const completionTokens = Math.floor(Math.random() * 150) + 50;
        const chatCost = promptTokens * 0.000000075 + completionTokens * 0.0000003;

        costLogs.push({
          tenantId: TENANT_ID,
          model: 'gemini-1.5-flash',
          promptTokens,
          completionTokens,
          totalCost: chatCost,
          operation: 'chat',
          createdAt: new Date(date.getTime() + c * 3 * 3600 * 1000), // spread over the day
        });
      }

      // 1-2 embedding jobs some days
      if (day % 2 === 0) {
        const tokens = Math.floor(Math.random() * 1500) + 500;
        const embedCost = tokens * 0.00000005;
        costLogs.push({
          tenantId: TENANT_ID,
          model: 'text-embedding-004',
          promptTokens: tokens,
          completionTokens: 0,
          totalCost: embedCost,
          operation: 'embedding',
          createdAt: new Date(date.getTime() + 12 * 3600 * 1000),
        });
      }
    }

    await tx.costLog.createMany({
      data: costLogs,
    });
  });

  console.log('PostgreSQL database seeded successfully!');
  console.log('\n==================================================');
  console.log('DEMO TENANT CREATED SUCCESSFULLY');
  console.log('--------------------------------------------------');
  console.log(`Tenant Name:  Acme Coffee Co.`);
  console.log(`Tenant Slug:  acme-coffee`);
  console.log(`Tenant ID:    ${TENANT_ID}`);
  console.log(`Admin User:   admin@acmecoffee.com / Password123!`);
  console.log(`Demo API Key: ${RAW_API_KEY}`);
  console.log('==================================================\n');
}

seed()
  .catch((e) => {
    console.error('Seeding script failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
