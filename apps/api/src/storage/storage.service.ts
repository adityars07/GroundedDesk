import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'attachments');

  constructor() {
    // Ensure attachment upload folder exists
    fs.mkdir(this.uploadDir, { recursive: true }).catch((err) => {
      this.logger.error('Failed to create attachments upload directory', err);
    });
  }

  async uploadFile(
    tenantId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<{ url: string; name: string; mimeType: string }> {
    const fileExt = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${fileExt}`;
    const tenantFolder = path.join(this.uploadDir, tenantId);

    // Ensure tenant subfolder exists
    await fs.mkdir(tenantFolder, { recursive: true });
    const filePath = path.join(tenantFolder, uniqueFilename);

    // Save locally
    await fs.writeFile(filePath, file.buffer);

    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const fileUrl = `${apiBaseUrl}/api/storage/uploads/${tenantId}/${uniqueFilename}`;

    this.logger.log(`Uploaded file for tenant ${tenantId} saved to ${filePath}, URL: ${fileUrl}`);

    return {
      url: fileUrl,
      name: file.originalname,
      mimeType: file.mimetype,
    };
  }

  async getFileBuffer(tenantId: string, filename: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const filePath = path.join(this.uploadDir, tenantId, filename);
      const buffer = await fs.readFile(filePath);
      
      // Basic mime type detection
      const ext = path.extname(filename).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.pdf') mimeType = 'application/pdf';

      return { buffer, mimeType };
    } catch {
      return null;
    }
  }
}
