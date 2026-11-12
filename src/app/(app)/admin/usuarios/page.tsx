import { redirect } from "next/navigation";

// Usuários e permissões agora fica no portal, fora do Caixa consolidado.
export default function UsuariosAntigo() {
  redirect("/usuarios");
}
