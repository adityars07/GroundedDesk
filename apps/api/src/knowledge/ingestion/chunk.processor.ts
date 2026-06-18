import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionProducer, ChunkJobData } from './ingestion.producer';

const CHUNK_SIZE = 512; // target tokens per chunk
const CHUNK_OVERLAP = 50; // overlap tokens between chunks
const CHARS_PER_TOKEN = 4; // approximate characters per token

/**
 * Recursive text splitter that chunks text into overlapping segments.
 * Tries to split on paragraph boundaries first, then sentences, then words.
 */
@Processor('chunk')
export class ChunkProcessor extends WorkerHost {
  private readonly logger = new Logger(ChunkProcessor.name);

  constructor(private readonly ingestionProducer: IngestionProducer) {
    super();
  }

  async process(job: Job<ChunkJobData>): Promise<void> {
    const { sourceId, tenantId, rawText, sourceName, sourceType } = job.data;
    this.logger.log(`Chunking source ${sourceId} (${rawText.length} chars)`);

    const maxChars = CHUNK_SIZE * CHARS_PER_TOKEN;
    const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;

    const textChunks = this.recursiveTextSplit(rawText, maxChars, overlapChars);

    this.logger.log(`Split into ${textChunks.length} chunks`);

    const chunks = textChunks.map((content, index) => ({
      content,
      metadata: {
        sourceName,
        sourceType,
        chunkIndex: index,
        totalChunks: textChunks.length,
      },
    }));

    // Queue embedding job (batch all chunks together)
    await this.ingestionProducer.queueEmbed({
      sourceId,
      tenantId,
      chunks,
    });
  }

  /**
   * Recursively split text by trying different separators:
   * 1. Double newline (paragraph boundary)
   * 2. Single newline
   * 3. Sentence boundary (. ! ?)
   * 4. Space (word boundary)
   * 5. Character (last resort)
   */
  private recursiveTextSplit(
    text: string,
    maxChars: number,
    overlapChars: number,
  ): string[] {
    const separators = ['\n\n', '\n', '. ', '! ', '? ', ' ', ''];
    return this.splitWithSeparators(text, maxChars, overlapChars, separators);
  }

  private splitWithSeparators(
    text: string,
    maxChars: number,
    overlapChars: number,
    separators: string[],
  ): string[] {
    if (text.length <= maxChars) {
      return text.trim() ? [text.trim()] : [];
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (separator === '') {
      // Last resort: split by character count
      return this.splitByCharCount(text, maxChars, overlapChars);
    }

    const parts = text.split(separator);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const part of parts) {
      const candidate = currentChunk
        ? currentChunk + separator + part
        : part;

      if (candidate.length <= maxChars) {
        currentChunk = candidate;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }

        // If this single part is too long, recurse with smaller separators
        if (part.length > maxChars && remainingSeparators.length > 0) {
          const subChunks = this.splitWithSeparators(
            part,
            maxChars,
            overlapChars,
            remainingSeparators,
          );
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = part;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Add overlap between consecutive chunks
    return this.addOverlap(chunks, overlapChars);
  }

  private splitByCharCount(
    text: string,
    maxChars: number,
    overlapChars: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      chunks.push(text.substring(start, end).trim());
      start = end - overlapChars;
      if (start >= text.length) break;
    }

    return chunks.filter((c) => c.length > 0);
  }

  private addOverlap(chunks: string[], overlapChars: number): string[] {
    if (chunks.length <= 1 || overlapChars <= 0) return chunks;

    const result: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        result.push(chunks[i]);
      } else {
        // Prepend the tail of the previous chunk
        const prevTail = chunks[i - 1].slice(-overlapChars);
        result.push(prevTail + ' ' + chunks[i]);
      }
    }
    return result;
  }
}
