import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Serverless Postgres (Neon) suspends compute after inactivity; the first query
 * after idle can fail with P1001 ("can't reach database") while the compute wakes.
 * This middleware transparently retries connection-level errors with backoff so a
 * cold start never surfaces as a user-facing error.
 */
const RETRYABLE = new Set(["P1001", "P1002", "P1008", "P1017"]);

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const code = (err as Prisma.PrismaClientKnownRequestError)?.code;
            const isInit = err instanceof Prisma.PrismaClientInitializationError;
            if (!isInit && !RETRYABLE.has(code)) throw err;
            lastErr = err;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        throw lastErr;
      },
    },
  });
}

export const db = (globalForPrisma.prisma ?? createClient()) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
