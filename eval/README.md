# GroundedDesk — RAG Evaluation Harness

This directory contains the custom evaluation harness for measuring RAG pipeline quality.

## Setup

1. Make sure your root `.env` file has a valid `GEMINI_API_KEY`.
2. Install workspace dependencies by running `pnpm install` in the root directory.

## Running Evaluations

Run the evaluation runner:
```bash
pnpm --filter eval run evaluate
```

This will:
1. Load 5 Q&A test cases representing customer questions.
2. Pre-embed the local knowledge base chunks using `text-embedding-004`.
3. Simulate semantic retrieval using cosine similarity.
4. Call `gemini-1.5-flash` with the retrieved context chunks to generate RAG completions.
5. Grade the quality metrics using `gemini-1.5-flash` as an evaluator judge.
6. Generate a summary markdown report inside `eval/report.md`.

## Measured Metrics

| Metric | Target | Description |
|---|---|---|
| **Faithfulness** | > 0.85 | Grades if the generated answer relies *only* on retrieved context chunks, without making up outer facts (hallucinations). |
| **Context Precision** | > 0.75 | Grades if the retrieved chunks are highly relevant to answering the query. |
| **Answer Relevance** | > 0.80 | Grades how directly the generated answer addresses the question. |
| **Hallucination Rate** | < 10% | Inverse of faithfulness. |
