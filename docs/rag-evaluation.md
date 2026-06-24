# RAG Quality Evaluation Harness Documentation

This document explains the GroundedDesk RAG quality evaluation suite, which measures the factual grounding and retrieval quality of our AI customer-support system using an LLM-as-a-judge approach.

---

## 1. Quality Metrics Defined

To prevent "vibe-based development," GroundedDesk implements automated TypeScript-native evaluations based on four core RAG parameters:

```
                  ┌──────────────────────┐
                  │    User Question     │
                  └──────────┬───────────┘
                             │
                  [ Context Precision ]  <─ Is the context relevant?
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Retrieved Context   │
                  └──────────┬───────────┘
                             │
                      [ Faithfulness ]   <─ Is the answer grounded in context?
                             │
                             ▼
                  ┌──────────────────────┐
                  │   Generated Answer   │
                  └──────────┬───────────┘
                             │
                   [ Answer Relevance ]  <─ Does the answer address the question?
                             │
                             ▼
                    ┌─────────────────┐
                    │  Quality Report │
                    └─────────────────┘
```

### A. Faithfulness
- **Definition**: Measures if the generated response is strictly grounded in the retrieved context. It checks if the assistant is making up claims (hallucinating) that cannot be verified by the documents.
- **Grader Method**: The judge LLM extracts claims from the generated answer and checks if each claim is directly supported by the context.
- **Score Range**: `0.0` (unsupported) to `1.0` (fully grounded).
- **Target**: `> 0.85`

### B. Context Precision
- **Definition**: Evaluates whether the system successfully retrieves the most relevant information chunks for the query.
- **Grader Method**: The judge LLM checks if each retrieved context block is highly relevant to the question and ground truth answer.
- **Score Range**: `0.0` to `1.0`.
- **Target**: `> 0.75`

### C. Answer Relevance
- **Definition**: Measures how well the generated response answers the user's specific question (e.g., does it write long fluff or does it directly solve the prompt?).
- **Grader Method**: The judge LLM grades if the response is concise and directly addresses the core user intent.
- **Score Range**: `0.0` to `1.0`.
- **Target**: `> 0.80`

### D. Hallucination Rate
- **Definition**: Calculated as `1 - Faithfulness`. It represents the percentage of facts inside the generated answers that are not supported by the knowledge base guide.
- **Target**: `< 10%`

---

## 2. Evaluation Datasets

The evaluation suite runs against a curated test dataset matching the seeded **Acme Coffee Co.** demo tenant.

- **Mock Knowledge Base** (`eval/datasets/acme-kb.json`): Contains 5 guide documents (PDFs, Markdown guides) covering products, shipping policy, return rules, locations, and brewing instructions.
- **QA Test Cases** (`eval/datasets/acme-coffee-qa.json`): Contains 5 evaluation QA pairs:
  ```json
  {
    "question": "What beans does Acme use for their signature espresso?",
    "groundTruth": "Acme uses single-origin organic Ethiopian Yirgacheffe beans for their signature espresso.",
    "expectedSource": "acme-product-guide.pdf"
  }
  ```

---

## 3. How the Evaluator Works

The evaluation runner (`eval/runner.ts`) performs the following steps:
1. **Pre-embeds** the mock KB chunks using Google Gemini `text-embedding-004` (or `gemini-embedding-001`).
2. **Retrieves** the top 2 context chunks for each test question using cosine similarity.
3. **Generates** an answer by feeding the system prompt, context chunks, and user question to the chat model (`gemini-1.5-flash`).
4. **Grades** the response using a custom `MetricsEvaluator` LLM-as-a-judge class (`eval/metrics/evaluator.ts`) powered by `gemini-1.5-flash`.
5. **Generates** a markdown report (`eval/report.md`) outlining the performance metrics.

---

## 4. Running the Evals

### Prerequisites
1. Ensure `GEMINI_API_KEY` is configured in `eval/.env` (or the root `.env`).
2. Make sure monorepo dependencies are installed.

### Execute Command
From the repository root workspace, run:
```bash
pnpm --filter eval run evaluate
```

### Sample Output Report (`eval/report.md`)
The runner will output a summary table and test case breakdowns like this:

| Metric | Score | Target | Status |
|---|---|---|---|
| Faithfulness | 0.95 | > 0.85 | ✅ PASS |
| Context Precision | 0.88 | > 0.75 | ✅ PASS |
| Answer Relevance | 0.90 | > 0.80 | ✅ PASS |
| Hallucination Rate | 5.0% | < 10% | ✅ PASS |

---

## 5. Extending the Evaluation Dataset

To add more test cases or evaluate a different tenant configuration:
1. Open [acme-coffee-qa.json](file:///c:/Users/Aditya%20RS/OneDrive/Desktop/Pulse/eval/datasets/acme-coffee-qa.json).
2. Append a new QA object following the existing schema:
   ```json
   {
     "question": "What is the flat shipping rate?",
     "groundTruth": "The flat shipping rate for bean orders under $35 is $4.99.",
     "expectedSource": "acme-shipping-policy.md"
   }
   ```
3. Run the evaluate script again to re-verify RAG performance.
