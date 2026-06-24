import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { MetricsEvaluator } from './metrics/evaluator';

// Load env vars from root directory
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface TestCase {
  question: string;
  groundTruth: string;
  expectedSource: string;
}

interface KbChunk {
  sourceName: string;
  content: string;
  embedding?: number[];
}

// System prompt template matching LlmService
function buildSystemPrompt(context: string): string {
  return `You are a helpful customer support assistant. Your role is to answer questions based ONLY on the provided knowledge base context.

RULES:
1. Answer questions using ONLY the information in the context below.
2. If the answer is not in the context, say "I don't have enough information to answer that question. Would you like to speak with a human agent?"
3. Always cite your sources using [Source N] notation at the end of relevant sentences.
4. Be concise, professional, and helpful.
5. Never make up information or speculate beyond the context.
6. If asked about topics outside the knowledge base domain, politely redirect.

KNOWLEDGE BASE CONTEXT:
${context}`;
}

// Cosine similarity helper
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 8, delay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isTransient = error?.status === 429 || (error?.status >= 500 && error?.status <= 504);
    if (isTransient && retries > 0) {
      console.warn(`[Runner] Transient error (${error?.status}). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not set in environment variables.');
    process.exit(1);
  }

  console.log('=== GroundedDesk RAG Evaluation Harness ===');
  console.log('Initializing Gemini client & metrics evaluator...');
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
  const evaluator = new MetricsEvaluator(apiKey);

  // Load datasets
  const qaPath = path.join(__dirname, 'datasets/acme-coffee-qa.json');
  const kbPath = path.join(__dirname, 'datasets/acme-kb.json');

  const testCases: TestCase[] = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  const kb: KbChunk[] = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

  console.log(`Loaded ${testCases.length} QA test cases.`);
  console.log(`Loaded ${kb.length} reference KB chunks.`);

  // 1. Pre-embed the KB chunks for semantic retrieval
  console.log('Generating embeddings for knowledge base chunks...');
  for (const chunk of kb) {
    const response = await withRetry(() => openai.embeddings.create({
      model: 'models/gemini-embedding-001',
      input: chunk.content,
      dimensions: 768,
    } as any));
    chunk.embedding = response.data[0].embedding;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  const results: any[] = [];
  let totalFaithfulness = 0;
  let totalPrecision = 0;
  let totalRelevance = 0;

  // 2. Run test cases
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n[Test ${i + 1}/${testCases.length}] Query: "${tc.question}"`);

    // A. Embed query
    const queryEmbResponse = await withRetry(() => openai.embeddings.create({
      model: 'models/gemini-embedding-001',
      input: tc.question,
      dimensions: 768,
    } as any));
    const queryEmbedding = queryEmbResponse.data[0].embedding;
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // B. Semantic Retrieval: find top-2 chunks from mock KB
    const scoredChunks = kb.map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding!);
      return { chunk, score };
    });

    // Sort descending by score
    scoredChunks.sort((a, b) => b.score - a.score);

    // Retrieve top 2
    const retrieved = scoredChunks.slice(0, 2);
    const contextText = retrieved
      .map((item, idx) => `[Source ${idx + 1}: ${item.chunk.sourceName}]\n${item.chunk.content}`)
      .join('\n\n---\n\n');

    // C. Generate Answer using RAG pipeline prompt
    console.log('Generating assistant answer...');
    const chatResponse = await withRetry(() => openai.chat.completions.create({
      model: 'models/gemini-2.5-flash',
      messages: [
        { role: 'system', content: buildSystemPrompt(contextText) },
        { role: 'user', content: tc.question },
      ],
      temperature: 0.1,
    }));

    const generatedAnswer = chatResponse.choices[0]?.message?.content || '';
    console.log(`Generated Answer: "${generatedAnswer.substring(0, 80)}..."`);
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // D. Evaluate Quality Metrics
    console.log('Running evaluation metrics...');
    const faithfulness = await evaluator.evaluateFaithfulness(generatedAnswer, contextText);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const precision = await evaluator.evaluateContextPrecision(
      tc.question,
      retrieved.map((r) => r.chunk.content),
      tc.groundTruth,
    );
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const relevance = await evaluator.evaluateAnswerRelevance(tc.question, generatedAnswer);

    totalFaithfulness += faithfulness;
    totalPrecision += precision;
    totalRelevance += relevance;

    results.push({
      question: tc.question,
      groundTruth: tc.groundTruth,
      generatedAnswer,
      faithfulness,
      contextPrecision: precision,
      answerRelevance: relevance,
      hallucinationRate: 1 - faithfulness,
    });

    console.log(`- Faithfulness: ${faithfulness.toFixed(2)}`);
    console.log(`- Context Precision: ${precision.toFixed(2)}`);
    console.log(`- Answer Relevance: ${relevance.toFixed(2)}`);

    // Pacing API requests to avoid rate limits
    if (i < testCases.length - 1) {
      console.log('Sleeping 4 seconds to pace API requests...');
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }

  // 3. Print Summary Markdown Report
  const avgFaithfulness = totalFaithfulness / testCases.length;
  const avgPrecision = totalPrecision / testCases.length;
  const avgRelevance = totalRelevance / testCases.length;
  const avgHallucination = 1 - avgFaithfulness;

  console.log('\n==================================================');
  console.log('EVALUATION RESULTS REPORT');
  console.log('==================================================\n');

  console.log('| Metric | Score | Target | Status |');
  console.log('|---|---|---|---|');
  console.log(`| Faithfulness | ${avgFaithfulness.toFixed(2)} | > 0.85 | ${avgFaithfulness >= 0.85 ? '✅ PASS' : '❌ FAIL'} |`);
  console.log(`| Context Precision | ${avgPrecision.toFixed(2)} | > 0.75 | ${avgPrecision >= 0.75 ? '✅ PASS' : '❌ FAIL'} |`);
  console.log(`| Answer Relevance | ${avgRelevance.toFixed(2)} | > 0.80 | ${avgRelevance >= 0.80 ? '✅ PASS' : '❌ FAIL'} |`);
  console.log(`| Hallucination Rate | ${(avgHallucination * 100).toFixed(1)}% | < 10% | ${avgHallucination <= 0.1 ? '✅ PASS' : '❌ FAIL'} |`);

  // Output detailed markdown report file
  const reportPath = path.join(__dirname, 'report.md');
  let mdContent = `# RAG Evaluation Suite Results\n\n`;
  mdContent += `Generated on: ${new Date().toISOString()}\n\n`;
  mdContent += `## Summary Metrics\n\n`;
  mdContent += `| Metric | Score | Target | Status |\n`;
  mdContent += `|---|---|---|---|\n`;
  mdContent += `| Faithfulness | ${avgFaithfulness.toFixed(2)} | > 0.85 | ${avgFaithfulness >= 0.85 ? '✅ PASS' : '❌ FAIL'} |\n`;
  mdContent += `| Context Precision | ${avgPrecision.toFixed(2)} | > 0.75 | ${avgPrecision >= 0.75 ? '✅ PASS' : '❌ FAIL'} |\n`;
  mdContent += `| Answer Relevance | ${avgRelevance.toFixed(2)} | > 0.80 | ${avgRelevance >= 0.80 ? '✅ PASS' : '❌ FAIL'} |\n`;
  mdContent += `| Hallucination Rate | ${(avgHallucination * 100).toFixed(1)}% | < 10% | ${avgHallucination <= 0.1 ? '✅ PASS' : '❌ FAIL'} |\n\n`;

  mdContent += `## Test Cases Details\n\n`;
  for (let idx = 0; idx < results.length; idx++) {
    const res = results[idx];
    mdContent += `### Test Case ${idx + 1}\n\n`;
    mdContent += `- **Question**: ${res.question}\n`;
    mdContent += `- **Ground Truth**: ${res.groundTruth}\n`;
    mdContent += `- **Generated Answer**: ${res.generatedAnswer}\n`;
    mdContent += `- **Faithfulness**: ${res.faithfulness.toFixed(2)}\n`;
    mdContent += `- **Context Precision**: ${res.contextPrecision.toFixed(2)}\n`;
    mdContent += `- **Answer Relevance**: ${res.answerRelevance.toFixed(2)}\n\n`;
  }

  fs.writeFileSync(reportPath, mdContent);
  console.log(`\nDetailed report written to: ${reportPath}`);
}

run().catch(console.error);
