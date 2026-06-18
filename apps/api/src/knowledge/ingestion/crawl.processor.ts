import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionProducer, CrawlJobData } from './ingestion.producer';
import { SourceStatus, SourceType } from '@prisma/client';
import * as cheerio from 'cheerio';

@Processor('crawl')
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionProducer: IngestionProducer,
  ) {
    super();
  }

  async process(job: Job<CrawlJobData>): Promise<void> {
    const { sourceId, tenantId, url } = job.data;
    this.logger.log(`Crawling URL: ${url} for source ${sourceId}`);

    try {
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: SourceStatus.PROCESSING },
      });

      // Fetch the page
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GroundedDesk-Crawler/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Try to find a sitemap link
      let pages: string[] = [url];
      const sitemapUrl = $('link[rel="sitemap"]').attr('href');

      if (sitemapUrl) {
        const resolvedSitemapUrl = new URL(sitemapUrl, url).toString();
        pages = await this.parseSitemap(resolvedSitemapUrl);
        this.logger.log(`Found ${pages.length} pages in sitemap`);
      }

      // Crawl each page and extract text (limit to 50 pages)
      const maxPages = 50;
      const pagesToCrawl = pages.slice(0, maxPages);
      const allText: string[] = [];

      for (const pageUrl of pagesToCrawl) {
        try {
          const text = await this.extractPageText(pageUrl);
          if (text.trim()) {
            allText.push(`--- Source: ${pageUrl} ---\n${text}`);
          }
        } catch (pageError) {
          this.logger.warn(`Failed to crawl ${pageUrl}: ${pageError}`);
        }
      }

      const combinedText = allText.join('\n\n');

      if (!combinedText.trim()) {
        throw new Error('No text content extracted from URL(s)');
      }

      this.logger.log(
        `Crawled ${pagesToCrawl.length} pages, ${combinedText.length} chars total`,
      );

      // Get source name
      const source = await this.prisma.knowledgeSource.findUnique({
        where: { id: sourceId },
      });

      // Queue chunking
      await this.ingestionProducer.queueChunk({
        sourceId,
        tenantId,
        rawText: combinedText,
        sourceName: source?.name || url,
        sourceType: SourceType.URL,
      });
    } catch (error) {
      this.logger.error(`Failed to crawl ${url}: ${error}`);

      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Crawl failed',
        },
      });

      throw error;
    }
  }

  private async parseSitemap(sitemapUrl: string): Promise<string[]> {
    try {
      const response = await fetch(sitemapUrl);
      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      const urls: string[] = [];
      $('url > loc').each((_, el) => {
        urls.push($(el).text());
      });

      return urls.length > 0 ? urls : [sitemapUrl];
    } catch {
      return [];
    }
  }

  private async extractPageText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GroundedDesk-Crawler/1.0',
      },
    });

    if (!response.ok) return '';

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer, header elements
    $('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation').remove();

    // Extract main content (try article, main, then body)
    let content = '';
    const mainElement = $('article, main, [role="main"], .content, .post-content');

    if (mainElement.length > 0) {
      content = mainElement.first().text();
    } else {
      content = $('body').text();
    }

    // Clean up whitespace
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
}
