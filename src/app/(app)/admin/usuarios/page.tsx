import { asc } from "drizzle-orm";
import { createUser, updateUser } from "@/app/actions/usuarios";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { db } from "@/db";
import { companyAccess, users, type Company, type Role } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { allCompanies } from "@/lib/queries";
import { roleLabels } from "@/lib/roles";

function AccessFields({ companies, current }: { companies: Company[]; current: Map<number, Role> }) {
  return (
    <div className="fields">
      {companies.map((c) => (
        <label key={c.id}>
          {c.name}
          <select name={`role_${c.id}`} defaultValue={current.get(c.id) ?? ""}>
            <option value="">Sem acesso</option>
            {(Object.keys(roleLabels) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const [list, access, companies] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(companyAccess),
    allCompanies(),
  ]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Usuários e acessos</h1>
          <p className="muted small">
            Administradores veem e alteram tudo. Os demais só enxergam as empresas liberadas, no nível escolhido. Toda alteração fica no log.
          </p>
        </div>
      </div>

      <details className="box">
        <summary>Novo usuário</summary>
        <ActionForm action={createUser} className="form">
          <div className="fields" style={{ marginTop: 10 }}>
            <label>
              Nome
              <input name="name" required maxLength={100} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required maxLength={200} />
            </label>
            <label>
              Senha provisória
              <input name="password" type="password" autoComplete="new-password" required minLength={10} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="isAdmin" /> Administrador (acesso total)
          </label>
          <AccessFields companies={companies} current={new Map()} />
          <div>
            <Submit>Criar usuário</Submit>
          </div>
        </ActionForm>
      </details>

      {list.map((u) => {
        const current = new Map(access.filter((a) => a.userId === u.id).map((a) => [a.companyId, a.role]));
        return (
          <details key={u.id} className="box">
            <summary>
              {u.name} <span className="muted small">{u.email}</span> {u.isAdmin && <span className="badge blue">admin</span>}{" "}
              {!u.active && <span className="badge red">inativo</span>}
              {u.lockedUntil && u.lockedUntil > new Date() && <span className="badge amber">bloqueado</span>}
            </summary>
            <ActionForm action={updateUser} className="form">
              <input type="hidden" name="id" value={u.id} />
              <div className="fields" style={{ marginTop: 10 }}>
                <label>
                  Nome
                  <input name="name" defaultValue={u.name} required maxLength={100} />
                </label>
                <label>
                  Nova senha provisória (opcional)
                  <input name="password" type="password" autoComplete="new-password" minLength={10} placeholder="Deixe em branco para manter" />
                </label>
              </div>
              <div className="filters">
                <label className="check">
                  <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} /> Ativo
                </label>
                <label className="check">
                  <input type="checkbox" name="isAdmin" defaultChecked={u.isAdmin} disabled={u.id === me.id} /> Administrador
                </label>
                {u.id === me.id && (
                  <>
                    <input type="hidden" name="active" value="on" />
                    <input type="hidden" name="isAdmin" value="on" />
                  </>
                )}
              </div>
              <AccessFields companies={companies} current={current} />
              <p className="small muted">
                Último acesso: {u.lastLoginAt ? u.lastLoginAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}
              </p>
              <div>
                <Submit>Salvar</Submit>
              </div>
            </ActionForm>
          </details>
        );
      })}
    </div>
  );
}
