# Caixa consolidado

Controle financeiro das empresas **Primetech Loja**, **Aura Educa** e **PrimeTech Sistemas**: lançamentos de entradas e saídas por empresa, contas a pagar e a receber, projeção de saldo, transferências e empréstimos entre empresas e uma visão consolidada do grupo.

## O que tem

- **Login com e-mail e senha.** Senhas guardadas com argon2id, sessão em cookie `httpOnly` que expira em 12 horas, bloqueio de 15 minutos após 5 tentativas erradas e troca obrigatória da senha provisória no primeiro acesso.
- **Menu por empresa** (visão geral, lançamentos, a pagar e receber, projeção, ajustes) e **Consolidado** (visão geral, a pagar e receber, projeção, entre empresas).
- **Permissões por empresa**: somente leitura, lança e edita, ou gestor (também exclui e configura contas e categorias). Administradores veem tudo. A permissão é conferida no servidor em toda tela e toda ação.
- **Lançamentos** com conta (caixa físico, banco, carteira), categoria, vencimento e baixa. Pendente = conta a pagar/receber. Opção de repetir todo mês.
- **Entre empresas**: empréstimo, devolução, aporte ou transferência simples. Gera a saída na origem e a entrada no destino; no consolidado se anulam. Mostra quem deve a quem.
- **Projeção** de 30, 60 ou 90 dias com menor saldo e alerta de saldo negativo.
- **Log de alterações** com quem, quando, IP e valores antes/depois. O banco recusa alteração ou exclusão desse log (trigger).
- **Integração CHServer (Integrador BI)**, somente leitura: importa os títulos de Receber e Pagar da Primetech Loja a cada 15 minutos.

## Tecnologia

Next.js 16 (App Router, TypeScript), PostgreSQL, Drizzle ORM. Sem dependências de front-end além do React; o gráfico é SVG gerado no servidor.

## Rodando localmente

Requer Node 20+ e um PostgreSQL.

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL
npm run db:migrate            # cria as tabelas, as 3 empresas, contas "Caixa físico" e "Banco" e categorias iniciais
npm run criar-admin -- seu@email.com "Seu nome"   # pede a senha no terminal
npm run dev
```

Testes: `npm test`. Verificação de tipos: `npm run lint`.

## Variáveis de ambiente

Veja `.env.example`. **Nenhum segredo vai para o repositório** (ele é público): token, endereço do CHServer e senha do banco ficam só nas variáveis de ambiente da hospedagem.

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão com o PostgreSQL |
| `ADMIN_EMAIL` / `ADMIN_SENHA_INICIAL` / `ADMIN_NOME` | Criam o primeiro administrador ao subir, só se ainda não houver usuários. Troca de senha obrigatória no 1º acesso; depois apague `ADMIN_SENHA_INICIAL` |
| `CRON_SECRET` | Segredo (32+ caracteres) que autoriza a chamada agendada de sincronização |
| `CHSERVER_URL` | Endereço externo do CHServerWeb, ex.: `http://servidor:8080` |
| `CHSERVER_TOKEN` | Token do Integrador BI (CHServer > Configurações > Integrador BI) |
| `CHSERVER_CNPJ` | CNPJ da estrutura principal no ERP |
| `CHSERVER_CHAVE_EMPRESA` | Chave da empresa no CHServer |
| `CHSERVER_EMPRESA_SLUG` / `CHSERVER_CONTA_NOME` | Empresa e conta que recebem os títulos (padrão: `primetech-loja` / `Banco`) |

## Publicação

1. Crie o banco PostgreSQL e o serviço web na hospedagem, apontando para este repositório.
2. Cadastre as variáveis de ambiente acima.
3. Comando de build: `npm run build`. Comando de início: `npm run start:prod` (prepara o banco, cria o primeiro administrador se preciso e sobe o servidor).
4. Agende a sincronização a cada 15 minutos:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/chserver`

Use sempre HTTPS (o cookie de sessão é marcado como `secure` em produção).

## Integração CHServer

Só usa `GET` nos recursos `Receber`, `Pagar`, `NFSaida` e `Empresa`; qualquer outro recurso é recusado no código (sem PIX, sem contas bancárias, sem escrita). Cada título vira um lançamento com chave única `receber:<CHAVE>` / `pagar:<CHAVE>`, então rodar de novo atualiza em vez de duplicar. `DATABAIXA`/`DATAPAGAMENTO` preenchida = realizado. Lançamentos importados não podem ser editados no caixa; a correção é feita no CHServer.

Pendente de confirmar com dados reais: significado de `STATUS`/`TIPO`, títulos cancelados, baixas parciais e o uso de `NFSaida` para o faturamento diário.
