import { PrismaClient } from '../prismaclient/index.js';
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
  await database.$connect();
  await database.$queryRaw`SELECT COUNT(*) FROM auth`;
  logger.success('Database connection established successfully');
}

// Database disconnection function
export async function disconnectDatabase(): Promise<void> {
  await database.$disconnect();
  logger.success('Database connection closed successfully');
}
