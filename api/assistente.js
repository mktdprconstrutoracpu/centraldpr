// ============================================================================
// POST /api/assistente   Authorization: Bearer <token do login da Central>
//   { mensagem }          o cliente escreveu (ou tocou num botao de assunto)
//   { acao: 'equipe' }    o cliente tocou em "Falar com a equipe"
//
// O chat da "Ana, da DPR" (20/11/2026), SEM IA paga: responde pelo roteiro em
// codigo (api/_roteiro.js) com os dados da casa da pessoa, e a equipe acompanha
// tudo no backoffice de clientes (aba Conversas), onde pode pausar o robo e
// responder a mao. Esta funcao:
//   1. confere o login e o limite de mensagens da pessoa;
//   2. le se o robo esta ligado (geral) e se a conversa dela esta pausada;
//   3. le, com a chave de servico, SO os dados das casas liberadas para ela;
//   4. robo pausado: so grava a mensagem e marca a conversa como aguardando a equipe;
//      robo ativo: responde pelo roteiro e, quando o assunto e da equipe, marca aguardando;
//   5. grava as mensagens e atualiza a conversa (assistente_conversas).
// Tabelas: sql/006_assistente.sql e sql/007_chat_roteiro.sql.
// Responde { resposta, encaminhada, opcoes, pausado, ids }.
//
// Variaveis de ambiente (Vercel, NUNCA no codigo):
//   SUPABASE_URL           https://roashkfdjgsweuftqhyx.supabase.co
//   SUPABASE_SERVICE_KEY   a chave de servico (a mesma do api/entrar-cpf.js);
//                          SUPABASE_SERVICE_ROLE_KEY tambem vale
// ============================================================================
const { responderRoteiro, ENCAMINHAR, JA_ENCAMINHADA } = require('./_roteiro');

const URL_SB = (process.env.SUPABASE_URL || 'https://roashkfdjgsweuftqhyx.supabase.co').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIMITE_HORA = 30, LIMITE_DIA = 120, TAMANHO_MAX = 1000;
const PEDIDO_EQUIPE = 'Quero falar com a equipe da DPR.';

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
const semTabela = (r) => /assistente_|relation|schema cache|column/i.test(JSON.stringify((r && r.dados) || ''));
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
  if (!CHAVE) return responder(res, 500, { erro: 'O chat ainda não está configurado (falta a chave do Supabase na Vercel).' });

  // 1. quem e
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(res, 401, { erro: 'Entre na Central para usar o chat.' });
  const ru = await fetch(URL_SB + '/auth/v1/user', { headers: { apikey: CHAVE, Authorization: 'Bearer ' + token } });
  if (!ru.ok) return responder(res, 401, { erro: 'Sua sessão terminou. Entre de novo na Central.' });
  const user = await ru.json();
  if (!user || !user.id) return responder(res, 401, { erro: 'Sua sessão terminou. Entre de novo na Central.' });

  const corpo = await lerCorpo(req);
  const pediuEquipe = corpo.acao === 'equipe';
  const mensagem = pediuEquipe ? PEDIDO_EQUIPE : String(corpo.mensagem || '').replace(/[ \t]+/g, ' ').trim();
  if (!mensagem) return responder(res, 400, { erro: 'Escreva sua dúvida.' });
  if (mensagem.length > TAMANHO_MAX) return responder(res, 400, { erro: 'A mensagem está muito longa. Resuma em até ' + TAMANHO_MAX + ' caracteres.' });

  // 2. limite (freia abuso), o interruptor geral e a conversa da pessoa
  const uid = encodeURIComponent(user.id);
  const [h1, h24, cfg, cv] = await Promise.all([
    sb('/rest/v1/assistente_mensagens?select=id&papel=eq.cliente&user_id=eq.' + uid + '&criado_em=gte.' + desde(3600e3) + '&limit=' + (LIMITE_HORA + 1)),
    sb('/rest/v1/assistente_mensagens?select=id&papel=eq.cliente&user_id=eq.' + uid + '&criado_em=gte.' + desde(86400e3) + '&limit=' + (LIMITE_DIA + 1)),
    sb('/rest/v1/assistente_config?select=valor&chave=eq.robo_ligado'),
    sb('/rest/v1/assistente_conversas?select=robo_pausado,aguardando_equipe&user_id=eq.' + uid)
  ]);
  if (!h1.ok || !cfg.ok || !cv.ok) {
    if (semTabela(h1) || semTabela(cfg) || semTabela(cv)) return responder(res, 500, { erro: 'O chat ainda não foi ligado no banco (sql/006 e sql/007).' });
    return responder(res, 502, { erro: 'Não consegui responder agora. Tente de novo em instantes.' });
  }
  if (lista(h1).length >= LIMITE_HORA || lista(h24).length >= LIMITE_DIA) return responder(res, 429, { erro: 'Você enviou muitas mensagens em pouco tempo. Tente de novo mais tarde.' });
  const roboLigado = !lista(cfg)[0] || lista(cfg)[0].valor !== 'nao';
  const conversa = lista(cv)[0] || { robo_pausado: false, aguardando_equipe: false };
  const pausado = !roboLigado || conversa.robo_pausado === true;

  // 3. os dados da pessoa (as respostas e o cabecalho da conversa no backoffice)
  const dados = await lerDados(user);

  // 4. a resposta
  let resposta = null, encaminhar = false, opcoes = false;
  if (pausado) {
    encaminhar = true;   // a equipe esta com a conversa: a mensagem fica aguardando a resposta dela
  } else if (pediuEquipe) {
    resposta = conversa.aguardando_equipe ? JA_ENCAMINHADA : ENCAMINHAR;
    encaminhar = true;
  } else {
    const r = responderRoteiro(mensagem, dados, conversa.aguardando_equipe === true);
    resposta = r.texto; encaminhar = r.encaminhar; opcoes = r.opcoes;
  }

  // 5. grava as mensagens e a conversa
  const linhas = [{ user_id: user.id, papel: 'cliente', texto: mensagem }];
  if (resposta) linhas.push({ user_id: user.id, papel: 'ana', texto: resposta.slice(0, 4000) });
  const g = await sb('/rest/v1/assistente_mensagens?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: linhas });
  if (!g.ok) return responder(res, 502, { erro: 'Não consegui registrar sua mensagem. Tente de novo em instantes.' });
  const agora = new Date().toISOString();
  const dadosConversa = {
    user_id: user.id, email: dados.email, nome: dados.nome || null,
    casas: dados.casas.map((c) => (c.unidade || '') + ' · ' + (c.empreendimento || '')).join('; ') || null,
    ultima_em: agora, ultima_texto: mensagem.slice(0, 300), ultima_papel: 'cliente'
  };
  if (encaminhar && !conversa.aguardando_equipe) Object.assign(dadosConversa, { aguardando_equipe: true, aguardando_desde: agora });
  await sb('/rest/v1/assistente_conversas?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: dadosConversa });

  return responder(res, 200, {
    resposta, encaminhada: encaminhar && !!resposta && resposta.indexOf(ENCAMINHAR) >= 0, opcoes, pausado,
    ids: lista(g).map((x) => x.id)
  });
};
