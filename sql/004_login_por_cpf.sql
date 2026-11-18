-- ============================================================================
-- 004_login_por_cpf.sql  (18/11/2026)
--
-- O cliente passa a entrar na Central com E-MAIL + CPF (o CPF e a senha):
--   1. a DPR cadastra no Financeiro o e-mail e o CPF do comprador (e do conjuge);
--   2. o cliente digita e-mail e CPF na Central;
--   3. a funcao api/entrar-cpf.js (servidor da Central, com a chave de servico)
--      confere se alguma casa tem aquele e-mail E aquele CPF juntos; se tiver,
--      cria a conta ja confirmada (ou acerta a senha para o CPF) e o cliente entra;
--   4. a Central chama liberar_por_email() (sql/003) e as casas aparecem.
--
-- O CPF fica guardado so com os 11 numeros, sem pontos nem traco.
-- Rode no SQL Editor do Supabase (projeto da Central). Pode rodar de novo.
-- ============================================================================

alter table public.unidades
  add column if not exists cpf_comprador text,
  add column if not exists cpf_conjuge   text;

comment on column public.unidades.cpf_comprador is
  'CPF do comprador, so os 11 numeros. Junto com email_comprador, e o login dele na Central (o CPF e a senha).';
comment on column public.unidades.cpf_conjuge is
  'CPF do conjuge ou segundo comprador, so os 11 numeros. Junto com email_conjuge, e o login dele na Central.';

-- so numeros, 11 digitos (ou vazio)
alter table public.unidades drop constraint if exists unidades_cpf_comprador_formato;
alter table public.unidades add constraint unidades_cpf_comprador_formato
  check (cpf_comprador is null or cpf_comprador ~ '^[0-9]{11}$');
alter table public.unidades drop constraint if exists unidades_cpf_conjuge_formato;
alter table public.unidades add constraint unidades_cpf_conjuge_formato
  check (cpf_conjuge is null or cpf_conjuge ~ '^[0-9]{11}$');

create index if not exists unidades_cpf_comprador_idx on public.unidades (cpf_comprador);
create index if not exists unidades_cpf_conjuge_idx   on public.unidades (cpf_conjuge);
