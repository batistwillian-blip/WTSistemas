import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return new Pool({ connectionString: url, max: 10 });
}

// Reaproveita o pool entre recarregamentos no modo de desenvolvimento.
const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
