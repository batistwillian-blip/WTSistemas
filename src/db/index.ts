import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// O pool só conecta na primeira consulta, então o build funciona mesmo sem DATABASE_URL.
function createPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}

// Reaproveita o pool entre recarregamentos no modo de desenvolvimento.
const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
