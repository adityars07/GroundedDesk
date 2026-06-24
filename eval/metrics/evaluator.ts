import OpenAI from 'openai';

export interface EvalMetricsResult {
  faithfulness: number;
  contextPrecision: number;
  answerRelevance: number;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 8, delay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isTransient = error?.status === 429 || (error?.status >= 500 && error?.status <= 504);
    if (isTransient && retries > 0) {
      console.warn(`[Evaluator] Transient error (${error?.status}). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

export class MetricsEvaluator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }

  /**
   * Evaluate Faithfulness (0-1): Does the generated answer contain only claims grounded in the retrieved context?
   */
  async evaluateFaithfulness(
    answer: string,
    context: string,
  ): Promise<number> {
    try {
      const response = await withRetry(() => this.openai.chat.completions.create({
        model: 'models/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert AI evaluator. Assess the faithfulness of the generated answer compared to the provided context.
Follow these steps:
1. Identify all factual statements/claims made in the generated answer.
2. For each statement, determine if it can be directly inferred from the provided context.
3. Calculate the score as: (number of statements supported by context) / (total number of statements).
4. If there are no statements or the answer just states "I don't know", the score is 1.0.

Respond ONLY with a JSON object in this format:
{
  "claims": [
    { "statement": "claim 1", "supported": true/false }
  ],
  "score": 0.XX
}
Do not write any other explanations or introductory text.`,
          },
          {
            role: 'user',
            content: `CONTEXT:\n${context}\n\nGENERATED ANSWER:\n${answer}`,
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }));

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      return result.score !== undefined ? Math.min(Math.max(result.score, 0), 1) : 0.5;
    } catch (error) {
      console.error('Error evaluating faithfulness:', error);
      return 0.5;
    }
  }

  /**
   * Evaluate Context Precision (0-1): Are the retrieved chunks relevant to answering the question?
   */
  async evaluateContextPrecision(
    question: string,
    chunks: string[],
    groundTruth: string,
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    try {
      let relevantCount = 0;

      for (const chunk of chunks) {
        const response = await withRetry(() => this.openai.chat.completions.create({
          model: 'models/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are an AI evaluator. Determine if the provided context chunk is highly relevant to answering the question, given the correct ground truth answer.
Respond ONLY with "YES" or "NO". Do not include punctuation or other text.`,
            },
            {
              role: 'user',
              content: `QUESTION: ${question}\nGROUND TRUTH: ${groundTruth}\nCONTEXT CHUNK: ${chunk}`,
            },
          ],
          temperature: 0,
          max_tokens: 5,
        }));

        const classification = response.choices[0]?.message?.content?.trim().toUpperCase() || 'NO';
        if (classification === 'YES') {
          relevantCount++;
        }
      }

      return relevantCount / chunks.length;
    } catch (error) {
      console.error('Error evaluating context precision:', error);
      return 0.5;
    }
  }

  /**
   * Evaluate Answer Relevance (0-1): Does the generated answer directly address the user's question?
   */
  async evaluateAnswerRelevance(
    question: string,
    answer: string,
  ): Promise<number> {
    try {
      const response = await withRetry(() => this.openai.chat.completions.create({
        model: 'models/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an AI evaluator. Assess the relevance of the generated answer compared to the user's question.
Ignore correctness or truthfulness. Focus purely on whether the answer directly addresses the question being asked, is complete, and doesn't introduce unrelated topics.
Score on a scale from 0.0 (unrelated) to 1.0 (completely addresses the question).

Respond ONLY with a JSON object in this format:
{
  "reasoning": "brief explanation",
  "score": 0.XX
}
Do not write any other explanations or introductory text.`,
          },
          {
            role: 'user',
            content: `QUESTION: ${question}\nGENERATED ANSWER: ${answer}`,
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }));

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      return result.score !== undefined ? Math.min(Math.max(result.score, 0), 1) : 0.5;
    } catch (error) {
      console.error('Error evaluating answer relevance:', error);
      return 0.5;
    }
  }
}
