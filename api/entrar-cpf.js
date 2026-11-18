// POST /api/entrar-cpf  { email, cpf }   (18/11/2026)
//
// Login da Central por E-MAIL + CPF (o CPF e a senha). A Central tenta entrar direto com e-mail e CPF;
// se nao der (a conta ainda nao existe, ou foi criada com outra senha), chama esta funcao, que:
//   1. confere se ALGUMA casa do Financeiro tem aquele e-mail E aquele CPF juntos (comprador ou conjuge);
//   2. se tiver, cria a conta ja confirmada com a senha = CPF, ou, se a conta ja existe, acerta a senha
//      para o CPF e confirma o e-mail;
//   3. responde ok, e a Central entra com e-mail e CPF. As casas aparecem por liberar_por_email() (sql/003).
// Se nao conferir, responde 401 sem dizer qual dos dois esta errado (para nao revelar quem e cliente).
//
// Variaveis de ambiente (na Vercel do projeto centraldpr, NUNCA no codigo):
//   SUPABASE_URL               https://roashkfdjgsweuftqhyx.supabase.co
//   SUPABASE_SERVICE_KEY       a chave de servico, a MESMA que a sincronizacao da planilha ja usa
//                              (api/sincronizar.js); SUPABASE_SERVICE_ROLE_KEY tambem vale
const URL_SB = (process.env.SUPABASE_URL || 'https://roashkfdjgsweuftqhyx.supabase.co').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function sb(caminho, opcoes) {
  const o = opcoes || {};
  const r = await fetch(URL_SB + caminho, {
    method: o.method || 'GET',
    headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}

function cpfValido(s) {
  if (!/^\d{11}$/.test(s) || /^(\d)\1{10}$/.test(s)) return false;
  const dv = (n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(s[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(s[9]) && dv(10) === Number(s[10]);
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((ok) => {
    let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => { try { ok(JSON.parse(t || '{}')); } catch (e) { ok({}); } });
  });
}

// procura a conta pelo e-mail (a API de admin lista de 1000 em 1000)
async function contaPorEmail(email) {
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await sb('/auth/v1/admin/users?page=' + pagina + '&per_page=1000');
    if (!r.ok) return { erro: r };
    const lista = (r.dados && r.dados.users) || [];
    const achou = lista.find((u) => String(u.email || '').trim().toLowerCase() === email);
    if (achou) return { conta: achou };
    if (lista.length < 1000) return { conta: null };
  }
  return { conta: null };
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST.' });
  if (!CHAVE) return responder(res, 500, { erro: 'A Central ainda nao esta configurada para o login por CPF (falta SUPABASE_SERVICE_KEY na Vercel).' });

  const corpo = await lerCorpo(req);
  const email = String(corpo.email || '').trim().toLowerCase();
  const cpf = String(corpo.cpf || '').replace(/\D/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return responder(res, 400, { erro: 'Confira o e-mail.' });
  if (!cpfValido(cpf)) return responder(res, 400, { erro: 'Confira o CPF: os números não fecham.' });

  // 1. alguma casa com este CPF e este e-mail juntos? (busca pelo CPF, que e exato, e compara o e-mail aqui)
  const r = await sb('/rest/v1/unidades?select=id,comprador,email_comprador,cpf_comprador,email_conjuge,cpf_conjuge&or=(cpf_comprador.eq.' + cpf + ',cpf_conjuge.eq.' + cpf + ')');
  if (!r.ok) {
    if (/cpf_comprador|cpf_conjuge/i.test(JSON.stringify(r.dados || ''))) return responder(res, 500, { erro: 'O login por CPF ainda nao foi ligado no banco (sql/004_login_por_cpf.sql).' });
    return responder(res, 500, { erro: 'Nao foi possivel conferir o cadastro agora. Tente de novo em instantes.' });
  }
  const limpa = (v) => String(v || '').trim().toLowerCase();
  const casa = (r.dados || []).find((u) =>
    (u.cpf_comprador === cpf && limpa(u.email_comprador) === email) ||
    (u.cpf_conjuge === cpf && limpa(u.email_conjuge) === email));
  if (!casa) {
    await espera(700); // freia quem tenta CPF atras de CPF
    return responder(res, 401, { erro: 'E-mail ou CPF não conferem com nenhum cadastro da DPR.' });
  }
  const ehComprador = casa.cpf_comprador === cpf && limpa(casa.email_comprador) === email;
  const nome = ehComprador ? String(casa.comprador || '').trim() : '';

  // 2. cria a conta, ou acerta a senha da que ja existe
  const achada = await contaPorEmail(email);
  if (achada.erro) return responder(res, 500, { erro: 'Nao foi possivel conferir a conta agora. Tente de novo em instantes.' });
  let feito;
  if (!achada.conta) {
    feito = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: cpf, email_confirm: true, user_metadata: nome ? { nome } : {} } });
  } else {
    const meta = Object.assign({}, achada.conta.user_metadata || {});
    if (nome && !meta.nome) meta.nome = nome;
    feito = await sb('/auth/v1/admin/users/' + achada.conta.id, { method: 'PUT', body: { password: cpf, email_confirm: true, user_metadata: meta } });
  }
  if (!feito.ok) return responder(res, 500, { erro: 'Nao foi possivel preparar o seu acesso agora. Tente de novo em instantes.' });
  return responder(res, 200, { ok: true, nova: !achada.conta });
};
