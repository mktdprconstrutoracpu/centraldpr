-- ============================================================================
-- SALDO DEVEDOR ATUAL DA CASA
--
-- Rodar no Supabase: SQL Editor > New query > colar > Run.
-- Pode rodar mais de uma vez sem estragar nada.
--
-- POR QUE ESTA COLUNA EXISTE
-- Cada aba da planilha termina com uma linha de rodapé: o rótulo
-- "DEVEDOR ATUALIZADO" e, ao lado, quanto a pessoa ainda deve hoje.
--
-- Essa linha NÃO é parcela (foi por isso que ela vinha entrando errada no
-- banco, como uma parcela sem data no meio do carnê). Mas o número dela é
-- justamente o que o cliente mais quer ver ao abrir o extrato: "quanto eu
-- ainda devo". Jogar fora a linha inteira jogava fora esse número junto.
--
-- ⚠️ É um valor CALCULADO PELA PLANILHA, igual a todo o resto. O banco não
-- recalcula: se recalculasse com um arredondamento diferente, o cliente veria
-- um número diferente do que a DPR manda para ele.
--
-- ⚠️ Confere com a aba RESUMO: para a CASA 03, tanto o rodapé quanto a coluna
-- SALDO DEVEDOR ATUALIZADO do RESUMO trazem R$ 240.544,78.
-- ============================================================================

alter table public.unidades
  add column if not exists saldo_devedor_atual numeric(14,2);

comment on column public.unidades.saldo_devedor_atual is
  'Quanto o comprador ainda deve, conforme a linha de rodape "DEVEDOR ATUALIZADO" da aba. Calculado pela planilha; o banco nao recalcula.';
