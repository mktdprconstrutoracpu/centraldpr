// ============================================================================
// POST /api/assistente  { mensagem }   Authorization: Bearer <token do login da Central>
//
// A "Ana, da DPR" (20/11/2026): assistente de duvidas dentro da Central do
// Cliente, so para quem esta logado (os compradores). Esta funcao:
//   1. confere o login (o token da sessao) e o limite de mensagens da pessoa;
//   2. le, com a chave de servico, SO os dados das casas liberadas para ela
//      (vinculos aprovados): saldo, parcelas, boleto, e a obra publicada;
//   3. chama o Claude com o roteiro aprovado (api/_ana.js) e o historico recente;
//   4. grava a pergunta e a resposta em assistente_mensagens e, quando a Ana
//      encaminha, a duvida em assistente_duvidas (backoffice de clientes).
// Tabelas: sql/006_assistente.sql.
//
// Variaveis de ambiente (Vercel, NUNCA no codigo):
//   ANTHROPIC_API_KEY      a chave da Anthropic (console.anthropic.com)
//   SUPABASE_URL           https://roashkfdjgsweuftqhyx.supabase.co
//   SUPABASE_SERVICE_KEY   a chave de servico (a mesma do api/entrar-cpf.js);
//                          SUPABASE_SERVICE_ROLE_KEY tambem vale
// ============================================================================
const Anthropic = require('@anthropic-ai/sdk').default;
const { ROTEIRO, dadosDoCliente, FORMATO } = require('./_ana');

const URL_SB = (process.env.SUPABASE_URL || 'https://roashkfdjgsweuftqhyx.supabase.co').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MODELO = 'claude-opus-5-5';
const LIMITE_HORA = 30, LIMITE_DIA = 120, HISTORICO = 12, TAMANHO_MAX = 1000;
const ENCAMINHAR_TEXTO = 'Vou encaminhar sua dúvida à equipe da DPR, que entrará em contato com você.';

function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}
async function sb(caminho, opcoes) {
  const o = opcoes || {};
  const r = await fetch(URL_SB + caminho, {
    method: o.method || 'GET',
    headers: Object.assign({ apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}
async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((ok) => {
    let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => { try { ok(JSON.parse(t || '{}')); } catch (e) { ok({}); } });
  });
}
const lista = (r) => (r.ok && Array.isArray(r.dados) ? r.dados : []);
const desde = (ms) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
// "hoje" no fuso de Sao Paulo, AAAA-MM-DD
function hojeSP() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

// as casas liberadas para a pessoa, com as parcelas, e a obra publicada do empreendimento dela
async function lerDados(user) {
  const vinc = lista(await sb('/rest/v1/vinculos?select=unidade_id&situacao=eq.aprovado&user_id=eq.' + encodeURIComponent(user.id)));
  const ids = [...new Set(vinc.map((v) => v.unidade_id))].filter((x) => Number.isInteger(Number(x)));
  let casas = [];
  if (ids.length) {
    const [u, p] = await Promise.all([
      sb('/rest/v1/unidades?select=id,empreendimento,unidade,status_contrato,valor_venda,saldo_devedor_atual&id=in.(' + ids.join(',') + ')'),
      sb('/rest/v1/parcelas?select=unidade_id,ordem,data_vencimento,tipo_parcela,parcela_corrigida,parcela_construtora,pago,boleto_caminho&unidade_id=in.(' + ids.join(',') + ')&order=ordem.asc')
    ]);
    const ps = lista(p);
    casas = lista(u).map((c) => Object.assign({}, c, { parcelas: ps.filter((x) => x.unidade_id === c.id) }));
  }
  // a obra: o empreendimento de nome igual ao da casa ou, se o painel tiver um so ativo, esse (igual a Central)
  let obra = null;
  const emps = lista(await sb('/rest/v1/obras_empreendimentos?select=id,nome&ativo=is.true'));
  const nomes = casas.map((c) => String(c.empreendimento || '').trim().toUpperCase());
  const emp = emps.find((e) => nomes.includes(String(e.nome || '').trim().toUpperCase())) || (emps.length === 1 && casas.length ? emps[0] : null);
  if (emp) {
    const [et, at] = await Promise.all([
      sb('/rest/v1/obras_etapas?select=nome,situacao,ordem&empreendimento_id=eq.' + emp.id),
      sb('/rest/v1/obras_atualizacoes?select=percentual,data_referencia&situacao=eq.aprovada&empreendimento_id=eq.' + emp.id + '&order=data_referencia.desc,criado_em.desc&limit=12')
    ]);
    const ats = lista(at);
    const comNumero = ats.find((a) => a.percentual != null);
    obra = { nome: emp.nome, etapas: lista(et), ultima: ats[0] ? { data_referencia: ats[0].data_referencia, percentual: comNumero ? comNumero.percentual : null } : null };
  }
  const nome = (user.user_metadata && (user.user_metadata.nome || user.user_metadata.name)) || '';
  return { nome, email: String(user.email || '').toLowerCase(), hoje: hojeSP(), casas, obra };
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST.' });
  if (!CHAVE || !process.env.ANTHROPIC_API_KEY) return responder(res, 500, { erro: 'A assistente ainda não está configurada (faltam chaves na Vercel).' });

  // 1. quem e
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(res, 401, { erro: 'Entre na Central para conversar com a Ana.' });
  const ru = await fetch(URL_SB + '/auth/v1/user', { headers: { apikey: CHAVE, Authorization: 'Bearer ' + token } });
  if (!ru.ok) return responder(res, 401, { erro: 'Sua sessão terminou. Entre de novo na Central.' });
  const user = await ru.json();
  if (!user || !user.id) return responder(res, 401, { erro: 'Sua sessão terminou. Entre de novo na Central.' });

  const corpo = await lerCorpo(req);
  const mensagem = String(corpo.mensagem || '').replace(/\s+/g, ' ').trim();
  if (!mensagem) return responder(res, 400, { erro: 'Escreva sua dúvida.' });
  if (mensagem.length > TAMANHO_MAX) return responder(res, 400, { erro: 'A mensagem está muito longa. Resuma em até ' + TAMANHO_MAX + ' caracteres.' });

  // 2. limite: freia abuso e custo
  const uid = encodeURIComponent(user.id);
  const [h1, h24] = await Promise.all([
    sb('/rest/v1/assistente_mensagens?select=id&papel=eq.cliente&user_id=eq.' + uid + '&criado_em=gte.' + desde(3600e3) + '&limit=' + (LIMITE_HORA + 1)),
    sb('/rest/v1/assistente_mensagens?select=id&papel=eq.cliente&user_id=eq.' + uid + '&criado_em=gte.' + desde(86400e3) + '&limit=' + (LIMITE_DIA + 1))
  ]);
  if (!h1.ok) {
    if (/assistente_mensagens|relation|schema cache/i.test(JSON.stringify(h1.dados || ''))) return responder(res, 500, { erro: 'A assistente ainda não foi ligada no banco (sql/006_assistente.sql).' });
    return responder(res, 502, { erro: 'Não consegui responder agora. Tente de novo em instantes.' });
  }
  if (lista(h1).length >= LIMITE_HORA || lista(h24).length >= LIMITE_DIA) return responder(res, 429, { erro: 'Você enviou muitas mensagens em pouco tempo. Tente de novo mais tarde.' });

  // 3. os dados da pessoa e o historico recente
  const dados = await lerDados(user);
  const hist = lista(await sb('/rest/v1/assistente_mensagens?select=papel,texto&user_id=eq.' + uid + '&order=criado_em.desc&limit=' + HISTORICO)).reverse();
  while (hist.length && hist[0].papel !== 'cliente') hist.shift();   // a conversa tem que comecar pelo cliente
  const messages = hist.map((m) => ({ role: m.papel === 'cliente' ? 'user' : 'assistant', content: m.texto }));
  messages.push({ role: 'user', content: mensagem });

  // 4. a Ana responde
  let resposta, encaminhar = false, resumo = '';
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // se o modelo principal recusar, a propria API refaz no modelo de reserva
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // conversa simples: esforco baixo (mais rapido e mais barato); a resposta sai no formato do roteiro
      output_config: { effort: 'low', format: FORMATO },
      // o roteiro e fixo e fica em cache; os dados da pessoa vem depois, a cada mensagem
      system: [
        { type: 'text', text: ROTEIRO, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dadosDoCliente(dados) }
      ],
      messages
    });
    if (r.stop_reason === 'refusal') {
      resposta = 'Não consigo ajudar com isso por aqui. Se for uma dúvida sobre a sua compra ou a obra, me conte de outro jeito que eu tento de novo.';
    } else {
      const bloco = (r.content || []).find((b) => b.type === 'text');
      const texto = bloco ? bloco.text : '';
      try {
        const j = JSON.parse(texto);
        resposta = String(j.resposta || '').trim();
        encaminhar = j.encaminhar === true;
        resumo = String(j.resumo || '').trim();
      } catch (e) {
        resposta = texto.trim();
      }
      if (!resposta) resposta = encaminhar ? ENCAMINHAR_TEXTO : 'Não consegui responder agora. Pode reformular a sua dúvida?';
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return responder(res, 500, { erro: 'A assistente está com a chave da Anthropic errada na Vercel.' });
    if (e instanceof Anthropic.RateLimitError) return responder(res, 503, { erro: 'Muitas pessoas estão usando a assistente agora. Tente de novo em instantes.' });
    if (e instanceof Anthropic.APIError) return responder(res, 502, { erro: 'Não consegui responder agora. Tente de novo em instantes.' });
    return responder(res, 500, { erro: 'Falha inesperada na assistente.' });
  }

  // 5. grava a conversa e, se for o caso, a duvida para a equipe
  await sb('/rest/v1/assistente_mensagens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: [
    { user_id: user.id, papel: 'cliente', texto: mensagem },
    { user_id: user.id, papel: 'ana', texto: resposta.slice(0, 4000) }
  ] });
  if (encaminhar) {
    await sb('/rest/v1/assistente_duvidas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: {
      user_id: user.id, email: dados.email, nome: dados.nome || null,
      casas: dados.casas.map((c) => (c.unidade || '') + ' · ' + (c.empreendimento || '')).join('; ') || null,
      pergunta: mensagem, resumo: (resumo || mensagem).slice(0, 1000)
    } });
  }
  return responder(res, 200, { resposta, encaminhada: encaminhar });
};
