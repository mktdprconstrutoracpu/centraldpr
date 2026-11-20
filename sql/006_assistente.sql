-- ============================================================================
-- 006_assistente.sql  (20/11/2026)
--
-- A "Ana, da DPR": assistente de duvidas dentro da Central do Cliente, so para
-- quem esta logado (os compradores). Quem conversa com a IA e a funcao
-- api/assistente.js da Central (chave da Anthropic e chave de servico do
-- Supabase so na Vercel); ela grava aqui:
--   assistente_mensagens  cada fala da conversa (cliente e Ana)
--   assistente_duvidas    o que a Ana encaminhou para a equipe responder; a
--                         equipe ve e marca como respondida no backoffice de clientes
--
-- Regras, aqui no banco:
--   - o cliente LE so as proprias mensagens e duvidas (historico do chat);
--   - o cliente NAO grava nada direto: sem politica de insert/update/delete
--     para authenticated. So a funcao (chave de servico) grava, entao ninguem
--     forja uma resposta da Ana nem um encaminhamento;
--   - visitante sem login nao le nada.
--
-- Rode no SQL Editor do Supabase (projeto da Central). Pode rodar de novo.
-- ============================================================================

create table if not exists public.assistente_mensagens (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  papel      text not null,
  texto      text not null,
  criado_em  timestamptz not null default now()
);
alter table public.assistente_mensagens drop constraint if exists assistente_mensagens_papel;
alter table public.assistente_mensagens add constraint assistente_mensagens_papel check (papel in ('cliente', 'ana'));
alter table public.assistente_mensagens drop constraint if exists assistente_mensagens_tamanho;
alter table public.assistente_mensagens add constraint assistente_mensagens_tamanho check (length(texto) between 1 and 4000);
create index if not exists assistente_mensagens_user_idx on public.assistente_mensagens (user_id, criado_em);

comment on table public.assistente_mensagens is
  'Conversas da Ana (assistente da DPR) na Central do Cliente. Gravadas so pela funcao api/assistente.js.';

create table if not exists public.assistente_duvidas (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  nome          text,
  casas         text,               -- ex.: "Casa 06 · Villagio Caucaia II"
  pergunta      text not null,      -- o que o cliente perguntou
  resumo        text,               -- o resumo que a Ana fez para a equipe
  situacao      text not null default 'aberta',
  criado_em     timestamptz not null default now(),
  respondida_em timestamptz,
  respondida_por text,              -- e-mail de quem marcou no backoffice
  nota          text                -- anotacao interna da equipe
);
alter table public.assistente_duvidas drop constraint if exists assistente_duvidas_situacao;
alter table public.assistente_duvidas add constraint assistente_duvidas_situacao check (situacao in ('aberta', 'respondida'));
create index if not exists assistente_duvidas_situacao_idx on public.assistente_duvidas (situacao, criado_em);
create index if not exists assistente_duvidas_user_idx on public.assistente_duvidas (user_id, criado_em);

comment on table public.assistente_duvidas is
  'Duvidas que a Ana encaminhou para a equipe da DPR; respondidas e marcadas no backoffice de clientes.';

alter table public.assistente_mensagens enable row level security;
alter table public.assistente_duvidas enable row level security;

drop policy if exists assistente_mensagens_le_as_suas on public.assistente_mensagens;
create policy assistente_mensagens_le_as_suas on public.assistente_mensagens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists assistente_duvidas_le_as_suas on public.assistente_duvidas;
create policy assistente_duvidas_le_as_suas on public.assistente_duvidas
  for select to authenticated using (user_id = auth.uid());

revoke all on public.assistente_mensagens from anon, authenticated;
revoke all on public.assistente_duvidas from anon, authenticated;
grant select on public.assistente_mensagens to authenticated;
grant select on public.assistente_duvidas to authenticated;
