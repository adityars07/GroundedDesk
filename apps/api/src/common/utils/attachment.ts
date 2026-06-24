import * as fs from 'fs/promises';
import * as path from 'path';

export async function getAttachmentBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  const match = url.match(/\/api\/storage\/uploads\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/);
  let buffer: Buffer;
  let mimeType = 'image/png';

  if (match) {
    const tenantId = match[1];
    const filename = match[2];
    const filePath = path.join(process.cwd(), 'uploads', 'attachments', tenantId, filename);
    try {
      buffer = await fs.readFile(filePath);
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.pdf') mimeType = 'application/pdf';
    } catch (err) {
      console.error(`Failed to read local attachment at ${filePath}`, err);
      return null;
    }
  } else {
    // Remote URL
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = response.headers.get('content-type') || 'image/png';
    } catch (err) {
      console.error(`Failed to fetch remote attachment from ${url}`, err);
      return null;
    }
  }

  // Normalize image types for LLM APIs (e.g. Gemini)
  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg';
  }

  return {
    data: buffer.toString('base64'),
    mimeType,
  };
}
