-- ============================================================================
-- Central DPR - extrato do cliente
--
-- ORIGEM DOS DADOS
-- Planilha por empreendimento, uma aba por casa (ex.: VILLAGIO CAUCAIA II,
-- abas CASA 01..CASA 08). A PLANILHA CONTINUA SENDO A FONTE DA VERDADE.
-- Este banco e um espelho, atualizado pela sincronizacao.
-- Divergencia se corrige NA PLANILHA e re-sincronizando, nunca editando o
-- espelho na mao - senao a proxima sincronizacao desfaz a correcao.
--
-- COMO RODAR
-- Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Pode rodar mais de uma vez sem estragar nada (tudo e "if not exists" /
-- "create or replace").
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. normalizar_nome()
--
-- O login casa com a planilha PELO NOME, entao os dois lados precisam ser
-- comparados na mesma forma: sem acento, em maiuscula, sem espaco duplicado.
-- "Géssica  Rodrigues de Lima" e "GESSICA RODRIGUES DE LIMA" viram a mesma
-- coisa.
--
-- Usa translate() em vez da extensao unaccent para nao depender de extensao
-- instalada no projeto.
-- ----------------------------------------------------------------------------
create or replace function public.normalizar_nome(p_nome text)
returns text
language sql
immutable
as $$
  select upper(
    trim(
      regexp_replace(
        translate(
          coalesce(p_nome, ''),
          'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ',
          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
        ),
        '\s+', ' ', 'g'
      )
    )
  );
$$;


-- ----------------------------------------------------------------------------
-- 2. unidades - uma linha por ABA da planilha (uma casa)
--
-- Vem do cabecalho da aba (linhas 1 a 4) mais o nome da aba.
-- ----------------------------------------------------------------------------
create table if not exists public.unidades (
  id                     bigint generated always as identity primary key,

  -- Identidade da casa. O par (empreendimento, unidade) e unico: e por ele que
  -- a sincronizacao decide se cria uma linha nova ou atualiza a existente.
  empreendimento         text not null,   -- "VILLAGIO CAUCAIA II"
  unidade                text not null,   -- "CASA 03"

  comprador              text not null,   -- como esta escrito na planilha

  -- Chave de comparacao com o nome do login. Calculada pelo banco a partir de
  -- comprador: nao da para os dois sairem do lugar.
  comprador_chave        text generated always as (public.normalizar_nome(comprador)) stored,

  -- Sai do nome da aba: "CASA 05 (Distrato)" -> distrato_aguardando.
  -- Vira coluna de verdade em vez de ficar preso no nome da aba.
  status_contrato        text not null default 'ativo'
    check (status_contrato in (
      'ativo',
      'aguardando_assinatura',
      'distrato_aguardando',
      'distrato_realizado'
    )),

  data_assinatura        date,
  valor_venda            numeric(14,2),
  financiamento_proposto numeric(14,2),
  fgts_proposto          numeric(14,2),

  aba_origem             text not null,   -- nome exato da aba, para rastrear
  atualizado_em          timestamptz not null default now(),

  constraint unidades_empreendimento_unidade_key unique (empreendimento, unidade)
);

create index if not exists unidades_comprador_chave_idx
  on public.unidades (comprador_chave);


-- ----------------------------------------------------------------------------
-- 3. parcelas - uma linha por vencimento (linha 6 em diante da aba)
--
-- ATENCAO: o banco guarda os valores JA CALCULADOS pela planilha. Ele nao
-- refaz conta de INCC nem de IGPM. Quem calcula e a planilha; se o banco
-- recalculasse, uma diferenca de arredondamento faria o cliente ver um numero
-- diferente do que voces mandam para ele.
-- ----------------------------------------------------------------------------
create table if not exists public.parcelas (
  id                  bigint generated always as identity primary key,
  unidade_id          bigint not null
                        references public.unidades(id) on delete cascade,

  -- Posicao da linha dentro da aba. Preserva a ordem original da planilha e
  -- serve de chave para a sincronizacao atualizar a linha certa.
  ordem               int not null,

  data_vencimento     date,             -- coluna A  - DATA
  tipo_parcela        text,             -- coluna C  - ATO / MENSAIS
  comissao            numeric(14,2),    -- coluna D  - COMISSAO
  saldo_construtora   numeric(14,2),    -- coluna E  - SALDO DA CONSTRUTORA

  -- coluna F - INCC %. Guardado como a pessoa le: 0.68 quer dizer 0,68%.
  incc_percentual     numeric(9,4),
  incc_valor          numeric(14,2),    -- coluna G  - INCC MES

  saldo_corrigido     numeric(14,2),    -- coluna H  - SALDO CORRIGIDO
  parcela_construtora numeric(14,2),    -- coluna I  - PARCELAS CONSTRUTORA
  igpm_valor          numeric(14,2),    -- coluna J  - IGPM PARCELA CONSTRUTORA
  parcela_corrigida   numeric(14,2),    -- coluna K  - PARCELA CORRIGIDA
  amortizacao         numeric(14,2),    -- coluna L  - AMORTIZACAO

  -- coluna M - STATUS DA PARCELA. Na planilha e "PAGO" ou vazio; viram um
  -- sim/nao, mais o texto original preservado para nao perder variacao.
  pago                boolean not null default false,
  status_texto        text,

  saldo_devedor       numeric(14,2),    -- coluna N  - SALDO DEVEDOR ATUALIZADO
  atualizado_em       timestamptz not null default now(),

  constraint parcelas_unidade_ordem_key unique (unidade_id, ordem)
);

create index if not exists parcelas_unidade_idx
  on public.parcelas (unidade_id, ordem);


-- ----------------------------------------------------------------------------
-- 4. vinculos - quem pode ver qual casa
--
-- POR QUE ESTA TABELA EXISTE
-- O nome do comprador nao e segredo. Se o nome sozinho liberasse o extrato,
-- qualquer pessoa criaria uma conta digitando o nome de um comprador e veria
-- quanto ele deve, quanto pagou e quanto custou a casa.
-- Entao o nome ACHA a casa, mas quem LIBERA e a DPR: o vinculo nasce
-- 'pendente' e alguem confirma.
-- ----------------------------------------------------------------------------
create table if not exists public.vinculos (
  id             bigint generated always as identity primary key,
  user_id        uuid   not null references auth.users(id) on delete cascade,
  unidade_id     bigint not null
                   references public.unidades(id) on delete cascade,

  situacao       text not null default 'pendente'
    check (situacao in ('pendente', 'aprovado', 'recusado')),

  -- Nome exatamente como a pessoa digitou no cadastro, congelado no momento do
  -- pedido. Se ela mudar o nome depois, fica registrado o que foi conferido.
  nome_no_pedido text not null,

  criado_em      timestamptz not null default now(),
  decidido_em    timestamptz,
  decidido_por   uuid references auth.users(id),

  constraint vinculos_user_unidade_key unique (user_id, unidade_id)
);

create index if not exists vinculos_pendentes_idx
  on public.vinculos (situacao, criado_em)
  where situacao = 'pendente';


-- ============================================================================
-- 5. TRAVAS DE ACESSO (RLS)
--
-- Estas travas valem no banco, nao no site. Nao adianta alguem chamar a API do
-- Supabase por fora da Central: sem vinculo aprovado, o banco devolve vazio.
-- A sincronizacao roda com a chave de servico, que passa por cima disto - e
-- por isso que essa chave NUNCA pode ir para o navegador.
-- ============================================================================

alter table public.unidades enable row level security;
alter table public.parcelas enable row level security;
alter table public.vinculos enable row level security;

-- Cliente enxerga a casa so com vinculo APROVADO.
drop policy if exists unidades_le_a_propria on public.unidades;
create policy unidades_le_a_propria on public.unidades
  for select to authenticated
  using (
    exists (
      select 1 from public.vinculos v
      where v.unidade_id = unidades.id
        and v.user_id    = auth.uid()
        and v.situacao   = 'aprovado'
    )
  );

-- Mesma regra para as parcelas.
drop policy if exists parcelas_le_as_proprias on public.parcelas;
create policy parcelas_le_as_proprias on public.parcelas
  for select to authenticated
  using (
    exists (
      select 1 from public.vinculos v
      where v.unidade_id = parcelas.unidade_id
        and v.user_id    = auth.uid()
        and v.situacao   = 'aprovado'
    )
  );

-- Cada pessoa ve so os proprios pedidos - para a Central poder dizer
-- "seu acesso esta em analise".
drop policy if exists vinculos_le_os_proprios on public.vinculos;
create policy vinculos_le_os_proprios on public.vinculos
  for select to authenticated
  using (user_id = auth.uid());

-- Nao existe policy de INSERT, UPDATE ou DELETE para o cliente em nenhuma das
-- tres tabelas. Isso e proposital: ninguem escreve a partir do navegador.
-- Quem escreve e a sincronizacao (chave de servico) e a funcao abaixo.


-- ----------------------------------------------------------------------------
-- 6. solicitar_acesso() - o cliente pede o vinculo
--
-- Por que uma funcao, e nao um insert direto: se o cliente pudesse consultar a
-- tabela unidades para achar o id da casa dele, poderia tambem listar as casas
-- dos outros. Aqui ele manda o nome, a funcao procura por dentro e devolve so
-- o que e dele.
--
-- security definer = roda com os poderes de quem criou a funcao, nao de quem
-- chamou. E o que permite procurar na tabela sem abrir a tabela.
-- ----------------------------------------------------------------------------
create or replace function public.solicitar_acesso(p_nome text)
returns table (
  encontrou      boolean,
  empreendimento text,
  unidade        text,
  situacao       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_unidade public.unidades%rowtype;
begin
  if v_uid is null then
    raise exception 'Precisa estar autenticado para pedir acesso.';
  end if;

  select u.* into v_unidade
    from public.unidades u
   where u.comprador_chave = public.normalizar_nome(p_nome)
   order by u.id
   limit 1;

  if not found then
    -- Nao encontrou. Devolve "nao achei" sem contar nada sobre a base.
    return query select false, null::text, null::text, null::text;
    return;
  end if;

  insert into public.vinculos (user_id, unidade_id, nome_no_pedido)
       values (v_uid, v_unidade.id, p_nome)
  on conflict (user_id, unidade_id) do nothing;

  return query
    select true,
           v_unidade.empreendimento,
           v_unidade.unidade,
           v.situacao
      from public.vinculos v
     where v.user_id = v_uid
       and v.unidade_id = v_unidade.id;
end;
$$;

revoke all on function public.solicitar_acesso(text) from public, anon;
grant execute on function public.solicitar_acesso(text) to authenticated;
