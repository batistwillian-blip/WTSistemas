import Link from "next/link";
import { asc } from "drizzle-orm";
import { createUser, updateUser } from "@/app/actions/usuarios";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PasswordInput } from "@/components/PasswordInput";
import { WtLogo } from "@/components/WtLogo";
import { db } from "@/db";
import { companyAccess, users, type Company, type Role, type User } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { AURA_PERMS, auraPermLabels, auraPermsOf } from "@/lib/aura/perms";
import { allCompanies } from "@/lib/queries";
import { roleLabels } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários e permissões · WT Sistemas" };

const roleHelp: Record<Role, string> = {
  leitura: "vê lançamentos, contas e relatórios",
  lancador: "também lança e edita",
  gestor: "também exclui e mexe nos ajustes da empresa",
};

/** As permissões de um usuário, separadas por sistema do portal. Somem quando a caixa Master está marcada. */
function Permissions({ user, companies, roles }: { user: Pick<User, "isAdmin" | "auraPerms"> | null; companies: Company[]; roles: Map<number, Role> }) {
  const aura = user ? auraPermsOf({ isAdmin: false, auraPerms: user.auraPerms }) : [];
  return (
    <>
      <p className="wt-master-note">O master tem acesso completo a todos os sistemas e empresas.</p>
      <div className="wt-perms">
        <section className="wt-sys aura">
          <h3>
            <span aria-hidden="true">🎯</span> Central de vendas da Aura
          </h3>
          <p className="wt-hint">Marque o que a pessoa pode fazer. Sem nada marcado, ela não vê a Central.</p>
          <div className="wt-checks">
            {AURA_PERMS.map((p) => (
              <label key={p} className="wt-check">
                <input type="checkbox" name="aura" value={p} defaultChecked={aura.includes(p)} />
                <span>
                  <b>{auraPermLabels[p].titulo}</b>
                  <small>{auraPermLabels[p].desc}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="wt-sys caixa">
          <h3>
            <span aria-hidden="true">💰</span> Caixa consolidado
          </h3>
          <p className="wt-hint">
            Escolha o nível em cada empresa. A área Pessoal é sempre só do dono, e o Consolidado mostra apenas as empresas liberadas.
          </p>
          <div className="wt-roles">
            {companies.map((c) => (
              <label key={c.id}>
                <span>{c.name}</span>
                <select name={`role_${c.id}`} defaultValue={roles.get(c.id) ?? ""}>
                  <option value="">Sem acesso</option>
                  {(Object.keys(roleLabels) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}: {roleHelp[r]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function summary(u: User, roles: Map<number, Role>, companies: Company[]) {
  if (u.isAdmin) return "Acesso completo";
  const parts: string[] = [];
  const aura = auraPermsOf(u);
  if (aura.length) parts.push(`Central: ${aura.map((p) => auraPermLabels[p].titulo.toLowerCase()).join(", ")}`);
  const names = companies.filter((c) => roles.has(c.id)).map((c) => c.name);
  if (names.length) parts.push(`Caixa: ${names.join(", ")}`);
  return parts.join(" · ") || "Sem acesso a nenhum sistema";
}

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const [list, access, companies] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(companyAccess),
    allCompanies(),
  ]);
  const rolesOf = (id: number) => new Map(access.filter((a) => a.userId === id).map((a) => [a.companyId, a.role]));

  return (
    <div className="wt wt-page">
      <div className="wt-top">
        <Link href="/inicio">← Início</Link>
        <span>{me.name}</span>
        <form method="post" action="/sair">
          <button>Sair</button>
        </form>
      </div>
      <div className="wt-admin">
        <WtLogo />
        <div className="wt-admin-head">
          <h1>Usuários e permissões</h1>
          <p className="wt-sub">Você cria os usuários e escolhe, sistema por sistema, o que cada um pode ver e fazer.</p>
        </div>

        <details className="wt-user new">
          <summary>
            <b>＋ Novo usuário</b>
          </summary>
          <ActionForm action={createUser} className="wt-uform" resetOnSuccess>
            <div className="wt-fields">
              <label>
                Nome
                <input name="name" required maxLength={100} autoComplete="off" />
              </label>
              <label>
                E-mail de login
                <input name="email" type="email" required maxLength={200} autoComplete="off" />
              </label>
              <label>
                Senha provisória (10+ caracteres)
                <PasswordInput name="password" autoComplete="new-password" required minLength={10} />
              </label>
            </div>
            <label className="wt-check master">
              <input type="checkbox" name="isAdmin" />
              <span>
                <b>Master</b>
                <small>Acesso total e pode criar usuários. Use só para quem administra tudo com você.</small>
              </span>
            </label>
            <Permissions user={null} companies={companies} roles={new Map()} />
            <p className="wt-hint">No primeiro acesso, a pessoa é obrigada a trocar a senha provisória.</p>
            <Submit className="wt-btn">Criar usuário</Submit>
          </ActionForm>
        </details>

        {list.map((u) => {
          const roles = rolesOf(u.id);
          const self = u.id === me.id;
          return (
            <details key={u.id} className="wt-user">
              <summary>
                <b>{u.name}</b>
                <span className="wt-email">{u.email}</span>
                {u.isAdmin && <span className="wt-tag master">master</span>}
                {!u.active && <span className="wt-tag off">inativo</span>}
                {u.lockedUntil && u.lockedUntil > new Date() && <span className="wt-tag lock">bloqueado</span>}
                <small className="wt-sum">{summary(u, roles, companies)}</small>
              </summary>
              <ActionForm action={updateUser} className="wt-uform">
                <input type="hidden" name="id" value={u.id} />
                <div className="wt-fields">
                  <label>
                    Nome
                    <input name="name" defaultValue={u.name} required maxLength={100} />
                  </label>
                  <label>
                    Nova senha provisória (opcional)
                    <PasswordInput name="password" autoComplete="new-password" minLength={10} placeholder="Deixe em branco para manter" />
                  </label>
                </div>
                <div className="wt-flags">
                  <label className="wt-check">
                    <input type="checkbox" name="active" defaultChecked={u.active} disabled={self} />
                    <span>
                      <b>Ativo</b>
                      <small>Desmarque para bloquear o acesso sem apagar o histórico.</small>
                    </span>
                  </label>
                  <label className="wt-check master">
                    <input type="checkbox" name="isAdmin" defaultChecked={u.isAdmin} disabled={self} />
                    <span>
                      <b>Master</b>
                      <small>Acesso total e pode criar usuários.</small>
                    </span>
                  </label>
                  {self && (
                    <>
                      <input type="hidden" name="active" value="on" />
                      <input type="hidden" name="isAdmin" value="on" />
                    </>
                  )}
                </div>
                <Permissions user={u} companies={companies} roles={roles} />
                <p className="wt-hint">
                  Último acesso:{" "}
                  {u.lastLoginAt ? u.lastLoginAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}
                </p>
                <Submit className="wt-btn">Salvar</Submit>
              </ActionForm>
            </details>
          );
        })}
      </div>
    </div>
  );
}
