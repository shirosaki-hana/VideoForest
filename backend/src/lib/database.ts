import { PrismaClient } from '../prismaclient/index.js';
import { logger } from '../utils/log.js';
import { isDevelopment } from '../config/envConfig.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const database =
  isDevelopment && globalForPrisma.prisma
    ? globalForPrisma.prisma
    : new PrismaClient({
        log: isDevelopment ? ['warn', 'error'] : ['error'], // 개발 환경에서만 상세 로깅
      });

if (isDevelopment) {
  globalForPrisma.prisma = database;
}

// Database connection status check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await database.$connect();
    logger.success('Database connection established successfully');

    // Test core table existence with a simple count query
    await database.$queryRaw`SELECT COUNT(*) FROM auth`;
    logger.success('Database core table test completed');

    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Database disconnection function
export async function disconnectDatabase(): Promise<void> {
  try {
    await database.$disconnect();
    logger.success('Database connection closed successfully');
  } catch (error) {
    logger.warn('Error during database disconnection:', error);
  }
}
