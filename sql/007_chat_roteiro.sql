-- ============================================================================
-- 007_chat_roteiro.sql  (20/11/2026)
--
-- O chat da Central SEM IA paga: a "Ana, da DPR" responde por um roteiro em
-- codigo (api/_roteiro.js) e a equipe acompanha tudo no backoffice de clientes,
-- podendo pausar o robo (numa conversa ou para todos) e responder a mao.
-- Vem depois do 006 (que criou assistente_mensagens) e so ACRESCENTA:
--   - assistente_mensagens aceita a fala da 'equipe' e guarda quem escreveu (autor);
--   - assistente_conversas: uma linha por cliente (robo pausado nela? aguardando a
--     equipe? ultima mensagem, lida pela equipe);
--   - assistente_config: o interruptor geral do robo (robo_ligado = sim/nao).
-- Regras (iguais ao 006): o cliente so LE a propria conversa; quem grava e a funcao
-- da Central e a do backoffice, com a chave de servico. A config ninguem le direto.
--
-- Rode no SQL Editor do Supabase (projeto da Central). Pode rodar de novo.
-- ============================================================================

alter table public.assistente_mensagens drop constraint if exists assistente_mensagens_papel;
alter table public.assistente_mensagens add constraint assistente_mensagens_papel check (papel in ('cliente', 'ana', 'equipe'));
alter table public.assistente_mensagens add column if not exists autor text;   -- e-mail de quem da equipe respondeu

create table if not exists public.assistente_conversas (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text,
  nome              text,
  casas             text,                 -- ex.: "CASA 06 · VILLAGIO CAUCAIA II"
  robo_pausado      boolean not null default false,
  pausado_por       text,
  pausado_em        timestamptz,
  aguardando_equipe boolean not null default false,
  aguardando_desde  timestamptz,
  ultima_em         timestamptz,
  ultima_texto      text,
  ultima_papel      text,
  lida_equipe_em    timestamptz
);
create index if not exists assistente_conversas_ultima_idx on public.assistente_conversas (ultima_em desc);

comment on table public.assistente_conversas is
  'Uma linha por cliente que usou o chat da Central: pausa do robo, aguardando a equipe e a ultima mensagem (backoffice de clientes).';

create table if not exists public.assistente_config (
  chave text primary key,
  valor text not null
);
insert into public.assistente_config (chave, valor) values ('robo_ligado', 'sim') on conflict (chave) do nothing;

alter table public.assistente_conversas enable row level security;
alter table public.assistente_config enable row level security;

drop policy if exists assistente_conversas_le_a_sua on public.assistente_conversas;
create policy assistente_conversas_le_a_sua on public.assistente_conversas
  for select to authenticated using (user_id = auth.uid());

revoke all on public.assistente_conversas from anon, authenticated;
revoke all on public.assistente_config from anon, authenticated;
grant select on public.assistente_conversas to authenticated;
