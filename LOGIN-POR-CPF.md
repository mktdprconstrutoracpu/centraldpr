# Login da Central por e-mail e CPF

Desde 18/11/2026 o cliente entra na Central com o **e-mail** e o **CPF**. O CPF é a senha. Não há mais cadastro nem código por e-mail.

## Como funciona

1. A DPR preenche no Financeiro, na ficha da casa, o **e-mail** e o **CPF** do comprador. Se houver cônjuge, preenche também o e-mail e o CPF dele.
2. O cliente abre a Central e digita o e-mail e o CPF. O CPF pode ser digitado com ou sem pontos.
3. A Central tenta entrar. Se a conta ainda não existe, ou se foi criada antes com outra senha, a função `api/entrar-cpf.js` confere se alguma casa tem aquele e-mail **e** aquele CPF juntos.
   - **Se tiver:** cria a conta já confirmada (ou troca a senha antiga pelo CPF) e o cliente entra.
   - **Se não tiver:** aparece "E-mail ou CPF não conferem com nenhum cadastro da DPR", sem dizer qual dos dois está errado.
4. Todas as casas com aquele e-mail aparecem na Central, pelo `liberar_por_email()` do `sql/003`.

## O que precisa estar feito

| O quê | Onde |
|---|---|
| Rodar `sql/004_login_por_cpf.sql` | Supabase, SQL Editor |
| `SUPABASE_SERVICE_KEY`, a mesma chave que a sincronização da planilha já usa (vale também com o nome `SUPABASE_SERVICE_ROLE_KEY`) | Vercel, projeto **centraldpr**, Settings > Environment Variables, Production e Preview |

## Cuidados

- Quem souber o e-mail e o CPF de um cliente entra na conta dele. Essa foi a escolha da DPR, pela praticidade.
- Se o cliente trocar de e-mail ou o CPF estiver errado no Financeiro, corrija na ficha da casa. Ele entra com o dado novo na mesma hora.
- O "Entrar como" do backoffice de clientes continua funcionando igual.
