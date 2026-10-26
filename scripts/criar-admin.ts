// Cria (ou redefine a senha de) um administrador.
// Uso: npm run criar-admin -- email@exemplo.com "Nome"
// A senha é pedida no terminal sem aparecer na tela. Em ambientes sem terminal, use a variável ADMIN_SENHA
// apenas durante o comando; nesse caso o usuário terá de trocar a senha no primeiro acesso.
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, passwordProblem } from "../src/lib/password";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email) {
    console.error('Uso: npm run criar-admin -- email@exemplo.com "Nome"');
    process.exit(1);
  }
  const name = nameParts.join(" ") || email.split("@")[0];
  const fromEnv = process.env.ADMIN_SENHA;
  const password = fromEnv ?? (await askHidden("Senha: "));
  if (!fromEnv && (await askHidden("Confirme a senha: ")) !== password) {
    console.error("As senhas não conferem.");
    process.exit(1);
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, isAdmin: true, active: true, failedAttempts: 0, lockedUntil: null, mustChangePassword: !!fromEnv })
      .where(eq(users.id, existing.id));
    console.log(`Administrador ${normalized} atualizado.`);
  } else {
    await db.insert(users).values({ name, email: normalized, passwordHash, isAdmin: true, mustChangePassword: !!fromEnv });
    console.log(`Administrador ${normalized} criado.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
