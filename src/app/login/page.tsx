import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/Mark";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

const EMPRESAS = [
  { name: "Primetech Loja", desc: "Acessórios de celular e informática", color: "#C06C17" },
  { name: "Aura Educa", desc: "EJA, graduação, pós e mestrado", color: "#4950B3" },
  { name: "PrimeTech Sistemas", desc: "Revenda de sistemas e consultoria em TI", color: "#A03876" },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-hero">
          <Mark />
          <h1>O caixa das três empresas, num lugar só.</h1>
          <p>Lance entradas e saídas de cada negócio, registre o dinheiro que passa de uma empresa para outra e veja quanto vai sobrar nas próximas semanas.</p>
          <div className="login-emps">
            {EMPRESAS.map((e) => (
              <div className="login-emp" key={e.name}>
                <span className="dot" style={{ background: e.color }} />
                <div>
                  <b>{e.name}</b>
                  <small>{e.desc}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="login-form">
          <h2>Entrar</h2>
          <LoginForm />
          <Link href="/recuperar" className="small">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </div>
  );
}
