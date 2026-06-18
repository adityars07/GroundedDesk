import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // WebSocket adapter (Socket.io)
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global prefix for REST endpoints
  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  await app.listen(port);
  console.log(`🚀 GroundedDesk API running on http://localhost:${port}`);
  console.log(`📡 WebSocket server ready`);
}

bootstrap();
