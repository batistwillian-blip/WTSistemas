// Aplica as migrações do banco. Em JavaScript puro para rodar em produção sem ferramentas de desenvolvimento.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Migrações aplicadas.");
} finally {
  await pool.end();
}
