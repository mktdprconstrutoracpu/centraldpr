-- ============================================================================
-- 005_troca_email.sql  (20/11/2026)
--
-- O cliente pede, na Central, para trocar o e-mail do login; a equipe aprova no
-- backoffice de clientes (aba "Alteracao de e-mail"). Ao aprovar, o backoffice
-- (api/troca-email.js, com a chave de servico) troca o e-mail da conta e o das
-- casas no cadastro do Financeiro (unidades.email_comprador / email_conjuge),
-- e o cliente passa a entrar com o e-mail novo e o mesmo CPF.
--
-- Regras, aqui no banco:
--   - o cliente so le e cria os proprios pedidos;
--   - so cria se o "e-mail atual" informado for o do login dele;
--   - um pedido pendente por pessoa;
--   - cancelar so pela funcao cancelar_troca_email() (pendente -> cancelada);
--   - aprovar e recusar ficam com o backoffice (chave de servico, que passa
--     por cima do RLS); o cliente nao tem politica de update nem de delete.
--
-- Rode no SQL Editor do Supabase (projeto da Central). Pode rodar de novo.
-- ============================================================================

create table if not exists public.troca_email (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  email_atual     text not null,
  email_novo      text not null,
  situacao        text not null default 'pendente',
  motivo          text,               -- o motivo da recusa (o cliente ve)
  criado_em       timestamptz not null default now(),
  decidido_em     timestamptz,
  decidido_por    text,               -- e-mail de quem aprovou ou recusou no backoffice
  casas_alteradas integer             -- quantas casas tiveram o e-mail trocado ao aprovar
);

alter table public.troca_email drop constraint if exists troca_email_situacao;
alter table public.troca_email add constraint troca_email_situacao
  check (situacao in ('pendente', 'aprovada', 'recusada', 'cancelada'));
alter table public.troca_email drop constraint if exists troca_email_formato;
alter table public.troca_email add constraint troca_email_formato
  check (email_novo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email_novo) <= 200);
alter table public.troca_email drop constraint if exists troca_email_diferente;
alter table public.troca_email add constraint troca_email_diferente
  check (lower(email_novo) <> lower(email_atual));

comment on table public.troca_email is
  'Pedidos de troca do e-mail de login feitos pelo cliente na Central; aprovados ou recusados no backoffice de clientes.';

-- um pedido pendente por pessoa
create unique index if not exists troca_email_um_pendente on public.troca_email (user_id) where situacao = 'pendente';
create index if not exists troca_email_situacao_idx on public.troca_email (situacao, criado_em);

-- o pedido nasce limpo: e-mails em minusculas e sem espacos, pendente, sem decisao
create or replace function public.troca_email_ao_criar()
returns trigger language plpgsql as $$
begin
  new.email_atual := lower(trim(new.email_atual));
  new.email_novo := lower(trim(new.email_novo));
  if coalesce(auth.role(), '') <> 'service_role' then
    new.situacao := 'pendente';
    new.motivo := null;
    new.decidido_em := null;
    new.decidido_por := null;
    new.casas_alteradas := null;
    new.criado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists troca_email_ao_criar on public.troca_email;
create trigger troca_email_ao_criar before insert on public.troca_email
  for each row execute function public.troca_email_ao_criar();

alter table public.troca_email enable row level security;

drop policy if exists troca_email_le_os_seus on public.troca_email;
create policy troca_email_le_os_seus on public.troca_email
  for select to authenticated using (user_id = auth.uid());

drop policy if exists troca_email_cria_o_seu on public.troca_email;
create policy troca_email_cria_o_seu on public.troca_email
  for insert to authenticated with check (
    user_id = auth.uid()
    and lower(trim(email_atual)) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

revoke all on public.troca_email from anon;
grant select, insert on public.troca_email to authenticated;

-- o cliente cancela o proprio pedido pendente (sem politica de update: so por aqui)
create or replace function public.cancelar_troca_email()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Precisa estar autenticado.'; end if;
  update public.troca_email set situacao = 'cancelada', decidido_em = now()
   where user_id = auth.uid() and situacao = 'pendente';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cancelar_troca_email() from public, anon;
grant execute on function public.cancelar_troca_email() to authenticated;
