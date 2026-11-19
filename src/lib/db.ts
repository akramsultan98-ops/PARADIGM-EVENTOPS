import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;

/** Prisma Decimal | number | null → number | null */
export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
