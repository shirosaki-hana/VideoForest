import { PrismaClient } from '../database/prismaclient/index.js';
import { logger } from '../utils/log.js';
import { isDevelopment } from '../config/index.js';
//------------------------------------------------------------------------------//
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create or reuse Prisma Client instance
function createPrismaClient(): PrismaClient {
  // In development, reuse existing instance to prevent multiple connections
  if (isDevelopment && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  // Create new PrismaClient instance
  const prismaClient = new PrismaClient();

  // Cache the instance in development mode
  if (isDevelopment) {
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient;
}

export const database = createPrismaClient();

// Database connection status check function
export async function checkDatabaseConnection(): Promise<void> {
  try {
    await database.$connect();
    await database.$queryRaw`SELECT 1`; // 간단한 연결 테스트
    logger.success('Database connection established successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

// Database disconnection function
export async function disconnectDatabase(): Promise<void> {
  await database.$disconnect();
  logger.success('Database connection closed successfully');
}
