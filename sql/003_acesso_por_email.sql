-- ============================================================================
-- 003_acesso_por_email.sql  (18/11/2026)
--
-- O acesso do cliente passa a ser pelo E-MAIL, e nao mais pelo nome:
--   1. a DPR cadastra no Financeiro o e-mail do comprador (e do conjuge);
--   2. o cliente cria a conta na Central e recebe um CODIGO no e-mail;
--   3. ao digitar o codigo, o Supabase confirma o e-mail da conta;
--   4. a Central chama liberar_por_email(): toda casa com aquele e-mail na
--      ficha fica ligada a pessoa, JA APROVADA (o codigo provou que o e-mail
--      e dela, e quem pos o e-mail na ficha foi a propria DPR).
--
-- Quem ja tem vinculo aprovado continua igual. Pedidos antigos pelo nome
-- (pendentes) continuam valendo e ainda podem ser aprovados a mao.
--
-- Rode no SQL Editor do Supabase (projeto da Central). Pode rodar de novo.
-- ============================================================================

-- 1. Os e-mails na ficha da casa
alter table public.unidades
  add column if not exists email_comprador text,
  add column if not exists email_conjuge   text;

comment on column public.unidades.email_comprador is
  'E-mail do comprador. E por ele (confirmado com codigo) que o cliente acessa a casa na Central.';
comment on column public.unidades.email_conjuge is
  'E-mail do conjuge ou segundo comprador; tambem libera o acesso a casa.';

create index if not exists unidades_email_comprador_idx on public.unidades (lower(email_comprador));
create index if not exists unidades_email_conjuge_idx   on public.unidades (lower(email_conjuge));


-- 2. Liga quem esta logado a todas as casas com o e-mail dele
create or replace function public.liberar_por_email()
returns table (casas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_confirmado timestamptz;
  v_n          integer := 0;
begin
  if v_uid is null then
    raise exception 'Precisa estar autenticado.';
  end if;

  select lower(trim(u.email)), u.email_confirmed_at
    into v_email, v_confirmado
    from auth.users u
   where u.id = v_uid;

  -- so libera e-mail CONFIRMADO (o codigo); sem isso, qualquer um que digitasse
  -- o e-mail de outra pessoa no cadastro ganharia acesso a casa dela
  if v_email is null or v_confirmado is null then
    return query select 0;
    return;
  end if;

  -- novas ligacoes ja aprovadas
  insert into public.vinculos (user_id, unidade_id, nome_no_pedido, situacao, decidido_em)
  select v_uid, x.id, 'e-mail: ' || v_email, 'aprovado', now()
    from public.unidades x
   where lower(trim(x.email_comprador)) = v_email
      or lower(trim(x.email_conjuge))   = v_email
  on conflict (user_id, unidade_id) do nothing;

  -- pedido antigo pelo nome que ainda estava pendente: o e-mail confirmado aprova
  -- (recusado continua recusado: foi decisao da DPR)
  update public.vinculos v
     set situacao = 'aprovado', decidido_em = now()
   where v.user_id = v_uid
     and v.situacao = 'pendente'
     and exists (select 1 from public.unidades x
                  where x.id = v.unidade_id
                    and (lower(trim(x.email_comprador)) = v_email
                      or lower(trim(x.email_conjuge))   = v_email));

  select count(*) into v_n
    from public.vinculos v
   where v.user_id = v_uid and v.situacao = 'aprovado';

  return query select v_n;
end;
$$;

revoke all on function public.liberar_por_email() from public, anon;
grant execute on function public.liberar_por_email() to authenticated;
