# Caixa consolidado

Controle financeiro das empresas **Primetech Loja**, **Aura Educa** e **PrimeTech Sistemas**: lançamentos de entradas e saídas por empresa, contas a pagar e a receber, projeção de saldo, transferências e empréstimos entre empresas e uma visão consolidada do grupo.

## O que tem

- **Login com e-mail e senha.** Senhas guardadas com argon2id, sessão em cookie `httpOnly` que expira em 12 horas, bloqueio de 15 minutos após 5 tentativas erradas e troca obrigatória da senha provisória no primeiro acesso.
- **Menu por empresa** (visão geral, lançamentos, vendas na empresa ligada ao CHServer, a pagar e receber, projeção, ajustes) e **Consolidado** (visão geral, a pagar e receber, projeção, entre empresas).
- **Permissões por empresa**: somente leitura, lança e edita, ou gestor (também exclui e configura contas e categorias). Administradores veem tudo. A permissão é conferida no servidor em toda tela e toda ação.
- **Lançamentos** com conta (caixa físico, banco, carteira), categoria, vencimento e baixa. Pendente = conta a pagar/receber. Opção de repetir todo mês.
- **Entre empresas**: empréstimo, devolução, aporte ou transferência simples. Gera a saída na origem e a entrada no destino; no consolidado se anulam. Mostra quem deve a quem.
- **Projeção** de 30, 60 ou 90 dias com menor saldo e alerta de saldo negativo.
- **Log de alterações** com quem, quando, IP e valores antes/depois. O banco recusa alteração ou exclusão desse log (trigger).
- **Integração CHServer (Integrador BI)**, somente leitura: configurada pelo administrador em Administração → Integrador BI (endereço, CNPJ, chave e token, que fica cifrado no banco), com botões Testar conexão e Importar agora. Importa as contas a pagar e as vendas (notas de saída) a cada 15 minutos enquanto o servidor está no ar. Contas a receber não são importadas.

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
| `ENCRYPTION_KEY` | Opcional. Chave para cifrar o token do CHServer no banco; sem ela, é derivada do `DATABASE_URL` |
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

Só usa `GET` nos recursos `Pagar`, `NFSaida` e `Empresa` (`Receber` fica liberado no cliente, mas não é importado); qualquer outro recurso é recusado no código (sem PIX, sem contas bancárias, sem escrita). Cada título a pagar vira um lançamento com chave única `pagar:<CHAVE>`, então rodar de novo atualiza em vez de duplicar. A situação segue o ERP (tabela `PAGAR`): `ATIVO` diferente de 1 = excluído e `STATUS` 2 = cancelado (não entram e saem do caixa), `STATUS` 0 = pago (usa `DATAPAGAMENTO` e `VLRPAGO` quando vierem), `STATUS` 1 = aberto ou parcial (fica o saldo, descontado `RECEBPARCIAL`). A janela de vencimentos vai de 2 anos atrás a 5 anos à frente. Em Administração → Integrador BI há uma conferência do total em aberto por período, para comparar com o relatório Contas a pagar (abertos/parciais) do CH. As notas de saída dos últimos 90 dias ficam na tela **Vendas** e o total líquido de cada dia (sem canceladas e devoluções) entra no caixa como um lançamento recebido `vendas:<AAAA-MM-DD>`. Lançamentos importados não podem ser editados no caixa; a correção é feita no CHServer.

Pendente de confirmar com dados reais: baixas parciais e a separação das vendas por forma de pagamento (cartão a prazo, por exemplo).
