// ============================================================================
// RECEBE UMA CASA DA PLANILHA E GRAVA NO SUPABASE.
//
// Quem chama: o script dentro da planilha (apps-script/sincronizar.gs), UMA
// casa por chamada.
//
// POR QUE UMA CASA POR CHAMADA, e não a planilha inteira:
//   - o corpo fica pequeno (nada de estourar limite de tamanho da requisição);
//   - cabe folgado no tempo máximo de uma função serverless;
//   - falha em UMA casa não derruba as outras 71.
//
// POR QUE A PLANILHA NÃO ESCREVE DIRETO NO SUPABASE:
// escrever no banco exige a chave de SERVIÇO, que passa por cima de todas as
// travas de acesso. Quem tem permissão de editar a planilha consegue abrir o
// script dentro dela e ler essa chave — e passaria a ter acesso total ao
// banco, incluindo os dados de login dos clientes. Aqui a chave fica só na
// Vercel. A planilha carrega uma senha própria (SYNC_SECRET) que só serve para
// mandar dados de casa; se ela vazar, o estrago é limitado a isso.
//
// Variáveis de ambiente (Vercel, só em Production/Preview — NUNCA no navegador):
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  a chave de serviço (sb_secret_... / service_role)
//   SYNC_SECRET           senha combinada com a planilha
// ============================================================================

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '');
const SYNC_SECRET = String(process.env.SYNC_SECRET || '');

const STATUS_VALIDOS = new Set([
  'ativo',
  'aguardando_assinatura',
  'distrato_aguardando',
  'distrato_realizado'
]);

// Comparação de senha em tempo constante. Um `===` vaza, pelo TEMPO de resposta,
// quantos caracteres do começo estão certos — dá para descobrir a senha um
// caractere por vez. Aqui todas as comparações custam o mesmo.
function segredoConfere(recebido, esperado) {
  const a = String(recebido || '');
  const b = String(esperado || '');
  if (!b) return false;                 // sem senha configurada -> recusa tudo
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function supabase(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1${caminho}`, {
    ...opcoes,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    }
  });
  const texto = await resposta.text();
  if (!resposta.ok) {
    // A mensagem do Supabase vai para o log da Vercel, não para quem chamou:
    // ela costuma citar nome de coluna e constraint, que não é assunto de
    // quem está do outro lado da chamada.
    console.error('[sincronizar] Supabase recusou', resposta.status, texto.slice(0, 400));
    const erro = new Error(`supabase_${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }
  return texto ? JSON.parse(texto) : null;
}

// Converte para número ou null. Aceita o que a planilha manda: número puro,
// "R$ 1.234,56", "0,68%", vazio, traço.
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const limpo = String(valor)
    .replace(/[R$\s%]/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')   // ponto de milhar
    .replace(',', '.');
  if (limpo === '' || limpo === '-') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// Data em ISO (YYYY-MM-DD) ou null. Aceita ISO, dd/mm/aaaa e dd/mm/aa.
function data(valor) {
  if (!valor) return null;
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!br) return null;
  const [, d, m, a] = br;
  // Ano de 2 dígitos: a planilha usa 24, 25, 26 — sempre 20xx.
  const ano = a.length === 2 ? `20${a}` : a;
  return `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function texto(valor) {
  const s = String(valor === null || valor === undefined ? '' : valor).trim();
  return s || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, erro: 'metodo_nao_permitido' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SYNC_SECRET) {
    // ⚠️ Diz QUAIS faltam e em QUAL ambiente. A primeira versão só respondia
    // "nao_configurado", e com isso não dava para distinguir "esqueci de criar
    // a variável" de "criei em Production e estou chamando o Preview" — que é
    // o engano mais comum, já que cada ambiente da Vercel tem o seu conjunto.
    // Só os NOMES vão na resposta. Valor de variável não sai daqui nunca.
    const faltando = [
      !SUPABASE_URL && 'SUPABASE_URL',
      !SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_KEY',
      !SYNC_SECRET && 'SYNC_SECRET'
    ].filter(Boolean);
    const ambiente = process.env.VERCEL_ENV || 'desconhecido';
    console.error('[sincronizar] faltam variáveis na Vercel', { ambiente, faltando });
    return res.status(500).json({ ok: false, erro: 'nao_configurado', ambiente, faltando });
  }
  if (!segredoConfere(req.headers['x-sync-secret'], SYNC_SECRET)) {
    return res.status(401).json({ ok: false, erro: 'nao_autorizado' });
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  const empreendimento = texto(corpo.empreendimento);
  const unidade = texto(corpo.unidade);
  const comprador = texto(corpo.comprador);
  if (!empreendimento || !unidade) {
    return res.status(400).json({ ok: false, erro: 'empreendimento_e_unidade_obrigatorios' });
  }
  // ⚠️ Sem comprador a casa não casa com ninguém no login. Recusar aqui deixa o
  // problema VISÍVEL no relatório da planilha, em vez de gravar uma linha que
  // nunca vai servir para nada e ninguém vai notar.
  if (!comprador) {
    return res.status(400).json({ ok: false, erro: 'comprador_vazio', unidade });
  }

  const statusRecebido = texto(corpo.status_contrato) || 'ativo';
  const status = STATUS_VALIDOS.has(statusRecebido) ? statusRecebido : 'ativo';

  try {
    // ------------------------------------------------------------------
    // 1. A CASA. Upsert por (empreendimento, unidade): rodar de novo
    //    atualiza, não duplica.
    // ------------------------------------------------------------------
    const [casa] = await supabase('/unidades?on_conflict=empreendimento,unidade', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([{
        empreendimento,
        unidade,
        comprador,
        status_contrato: status,
        data_assinatura: data(corpo.data_assinatura),
        valor_venda: numero(corpo.valor_venda),
        financiamento_proposto: numero(corpo.financiamento_proposto),
        fgts_proposto: numero(corpo.fgts_proposto),
        aba_origem: texto(corpo.aba_origem) || unidade,
        atualizado_em: new Date().toISOString()
      }])
    });

    if (!casa || !casa.id) {
      throw new Error('sem_id_da_unidade');
    }

    // ------------------------------------------------------------------
    // 2. AS PARCELAS.
    //
    // ⚠️ ATUALIZA no lugar, nunca "apaga tudo e recria". Entre o apagar e o
    // recriar existe um instante em que o cliente abriria o extrato e veria
    // um pedido vazio — e se o recriar falhasse no meio, ele ficaria vazio de
    // vez. É a mesma lição que custou caro na loja em 25/08.
    // Upsert por (unidade_id, ordem): a linha 7 da planilha é sempre a linha 7
    // do banco, atualizada no lugar.
    // ------------------------------------------------------------------
    const linhas = Array.isArray(corpo.parcelas) ? corpo.parcelas : [];
    const parcelas = linhas.map((p, i) => ({
      unidade_id: casa.id,
      ordem: Number(p.ordem) || (i + 1),
      data_vencimento: data(p.data_vencimento),
      tipo_parcela: texto(p.tipo_parcela),
      comissao: numero(p.comissao),
      saldo_construtora: numero(p.saldo_construtora),
      incc_percentual: numero(p.incc_percentual),
      incc_valor: numero(p.incc_valor),
      saldo_corrigido: numero(p.saldo_corrigido),
      parcela_construtora: numero(p.parcela_construtora),
      igpm_valor: numero(p.igpm_valor),
      parcela_corrigida: numero(p.parcela_corrigida),
      amortizacao: numero(p.amortizacao),
      pago: /pago/i.test(String(p.status_texto || '')),
      status_texto: texto(p.status_texto),
      saldo_devedor: numero(p.saldo_devedor),
      atualizado_em: new Date().toISOString()
    }));

    if (parcelas.length) {
      await supabase('/parcelas?on_conflict=unidade_id,ordem', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(parcelas)
      });
    }

    // ------------------------------------------------------------------
    // 3. SOBRAS. Se a planilha ENCURTOU (alguém apagou linhas do fim), as
    //    parcelas que passaram do fim precisam sair — senão o cliente segue
    //    vendo parcelas que não existem mais.
    //    Feito por ÚLTIMO e por FAIXA: nada é apagado antes de o novo estar
    //    gravado, e nunca se apaga a tabela inteira por falta de filtro.
    // ------------------------------------------------------------------
    let removidas = 0;
    if (parcelas.length) {
      const maiorOrdem = Math.max(...parcelas.map((p) => p.ordem));
      const sobras = await supabase(
        `/parcelas?unidade_id=eq.${casa.id}&ordem=gt.${maiorOrdem}`,
        { method: 'DELETE', headers: { Prefer: 'return=representation' } }
      );
      removidas = Array.isArray(sobras) ? sobras.length : 0;
    }

    return res.status(200).json({
      ok: true,
      unidade_id: casa.id,
      unidade,
      parcelas: parcelas.length,
      removidas
    });
  } catch (e) {
    console.error('[sincronizar] falhou', unidade, e && e.message);
    return res.status(502).json({ ok: false, erro: 'falha_ao_gravar', unidade });
  }
}
