import express from 'express'; import cors from 'cors'; import pg from 'pg'; import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken';
import crypto from 'node:crypto'; import QRCode from 'qrcode'; import otplib from 'otplib';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://energia:energia@localhost:5432/energia' });
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const { authenticator } = otplib; authenticator.options = { window: 1 };
const app = express(); app.use(cors(), express.json());
const q = (t, p) => pool.query(t, p).then(r => r.rows);
const h = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ erro: 'Erro interno do servidor' }); });
// req.uid guarda o CPF do usuário logado; tokens da etapa 2FA não dão acesso à API
// Também recusa sessões de usuários que não existem mais (ex.: banco recriado)
const auth = async (req, res, next) => {
  try { const p = jwt.verify((req.headers.authorization || '').slice(7), SECRET); if (p.etapa || !(await q('SELECT 1 FROM usuario WHERE cpf=$1', [p.uid])).length) throw 0; req.uid = p.uid; }
  catch { return res.status(401).json({ erro: 'Faça login para continuar' }); }
  next();
};
const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);
const iso = d => d.toISOString().slice(0, 10);
const periodo = (a, b, qr) => [qr[a] || iso(new Date(Date.now() - 29 * 864e5)), qr[b] || iso(new Date())];
const sessao = cpf => jwt.sign({ uid: cpf }, SECRET, { expiresIn: '7d' });
const soDigitos = v => String(v || '').replace(/\D/g, '');
function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += c[i] * (n + 1 - i); if ((s * 10 % 11) % 10 !== +c[n]) return false; }
  return true;
}

// Cadastro e login (aceita e-mail ou CPF)
app.post('/api/auth/register', h(async (req, res) => {
  const { nome, email, senha } = req.body, cpf = soDigitos(req.body.cpf);
  if (!nome || !email || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome, CPF, e-mail e senha com 6+ caracteres' });
  if (!cpfValido(cpf)) return res.status(400).json({ erro: 'CPF inválido' });
  if ((await q('SELECT 1 FROM usuario WHERE cpf=$1', [cpf])).length) return res.status(409).json({ erro: 'CPF já cadastrado' });
  if ((await q('SELECT 1 FROM usuario WHERE lower(email)=lower($1)', [email])).length) return res.status(409).json({ erro: 'E-mail já cadastrado' });
  await q('INSERT INTO usuario(cpf,nome,email,senha_hash) VALUES($1,$2,$3,$4)', [cpf, nome, email.trim(), await bcrypt.hash(senha, 10)]);
  res.json({ token: sessao(cpf) });
}));
app.post('/api/auth/login', h(async (req, res) => {
  const login = String(req.body.login || req.body.email || '').trim(), cpf = soDigitos(login);
  const [u] = cpf.length === 11 && !login.includes('@') ? await q('SELECT * FROM usuario WHERE cpf=$1', [cpf]) : await q('SELECT * FROM usuario WHERE lower(email)=lower($1)', [login]);
  if (!u || !(await bcrypt.compare(req.body.senha || '', u.senha_hash))) return res.status(401).json({ erro: 'Login ou senha incorretos' });
  if (u.totp_ativo) return res.json({ precisa_2fa: true, token_2fa: jwt.sign({ uid: u.cpf, etapa: '2fa', n: crypto.randomUUID() }, SECRET, { expiresIn: '5m' }) });
  res.json({ token: sessao(u.cpf) });
}));
// Segunda etapa do login: código do app autenticador (máx. 5 tentativas por token)
const tentativas = new Map();
app.post('/api/auth/login/2fa', h(async (req, res) => {
  let p; try { p = jwt.verify(req.body.token_2fa || '', SECRET); if (p.etapa !== '2fa') throw 0; } catch { return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' }); }
  const n = (tentativas.get(p.n) || 0) + 1; tentativas.set(p.n, n); setTimeout(() => tentativas.delete(p.n), 5 * 60e3);
  if (n > 5) return res.status(429).json({ erro: 'Muitas tentativas. Entre novamente.' });
  const [u] = await q('SELECT totp_secret FROM usuario WHERE cpf=$1 AND totp_ativo', [p.uid]);
  if (!u || !authenticator.check(String(req.body.codigo || '').replace(/\s/g, ''), u.totp_secret)) return res.status(401).json({ erro: 'Código inválido' });
  tentativas.delete(p.n); res.json({ token: sessao(p.uid) });
}));

// Esqueci minha senha: identificação pelo CPF. Se a conta tiver 2FA ativa, exige também o código do app autenticador.
app.post('/api/auth/recuperar', h(async (req, res) => {
  const [u] = await q('SELECT totp_ativo FROM usuario WHERE cpf=$1', [soDigitos(req.body.cpf)]);
  if (!u) return res.status(404).json({ erro: 'CPF não cadastrado' });
  res.json({ precisa_2fa: u.totp_ativo });
}));
const tentativasRec = new Map();
app.post('/api/auth/redefinir-senha', h(async (req, res) => {
  const cpf = soDigitos(req.body.cpf), { senha } = req.body;
  if (!senha || senha.length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter 6+ caracteres' });
  const [u] = await q('SELECT totp_ativo,totp_secret FROM usuario WHERE cpf=$1', [cpf]);
  if (!u) return res.status(404).json({ erro: 'CPF não cadastrado' });
  if (u.totp_ativo) {
    const n = (tentativasRec.get(cpf) || 0) + 1; tentativasRec.set(cpf, n); setTimeout(() => tentativasRec.delete(cpf), 15 * 60e3);
    if (n > 5) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    if (!authenticator.check(String(req.body.codigo || '').replace(/\s/g, ''), u.totp_secret)) return res.status(401).json({ erro: 'Código do app autenticador inválido' });
    tentativasRec.delete(cpf);
  }
  await q('UPDATE usuario SET senha_hash=$1 WHERE cpf=$2', [await bcrypt.hash(senha, 10), cpf]);
  res.json({ ok: true });
}));

app.use('/api', auth);
app.get('/api/me', h(async (req, res) => res.json((await q('SELECT cpf,nome,email,tarifa_kwh::float AS tarifa_kwh,totp_ativo FROM usuario WHERE cpf=$1', [req.uid]))[0])));
app.put('/api/me', h(async (req, res) => {
  const t = num(req.body.tarifa_kwh);
  if (t === null || t <= 0) return res.status(400).json({ erro: 'Tarifa deve ser maior que zero' });
  await q('UPDATE usuario SET tarifa_kwh=$1 WHERE cpf=$2', [t, req.uid]);
  await q('UPDATE registro_consumo SET custo_estimado=consumo_kwh*$1 WHERE equipamento_id IN (SELECT id FROM equipamento WHERE usuario_cpf=$2)', [t, req.uid]);
  res.json({ ok: true });
}));

// 2FA (TOTP: Google Authenticator, Microsoft Authenticator, Authy…)
app.post('/api/2fa/iniciar', h(async (req, res) => {
  const [u] = await q('SELECT email,totp_ativo FROM usuario WHERE cpf=$1', [req.uid]);
  if (u.totp_ativo) return res.status(400).json({ erro: 'A verificação em duas etapas já está ativa' });
  const secret = authenticator.generateSecret();
  await q('UPDATE usuario SET totp_secret=$1 WHERE cpf=$2', [secret, req.uid]);
  res.json({ secret, qr: await QRCode.toDataURL(authenticator.keyuri(u.email, 'Monitor de Energia', secret)) });
}));
app.post('/api/2fa/ativar', h(async (req, res) => {
  const [u] = await q('SELECT totp_secret FROM usuario WHERE cpf=$1', [req.uid]);
  if (!u.totp_secret || !authenticator.check(String(req.body.codigo || '').replace(/\s/g, ''), u.totp_secret)) return res.status(400).json({ erro: 'Código inválido. Confira o app e tente de novo.' });
  await q('UPDATE usuario SET totp_ativo=true WHERE cpf=$1', [req.uid]);
  res.json({ ok: true });
}));
app.post('/api/2fa/desativar', h(async (req, res) => {
  const [u] = await q('SELECT totp_secret,totp_ativo FROM usuario WHERE cpf=$1', [req.uid]);
  if (!u.totp_ativo || !authenticator.check(String(req.body.codigo || '').replace(/\s/g, ''), u.totp_secret)) return res.status(400).json({ erro: 'Código inválido' });
  await q('UPDATE usuario SET totp_ativo=false,totp_secret=NULL WHERE cpf=$1', [req.uid]);
  res.json({ ok: true });
}));

app.get('/api/categorias', h(async (_, res) => res.json(await q('SELECT * FROM categoria ORDER BY nome'))));
app.get('/api/dashboard-config', h(async (req, res) => res.json((await q('SELECT layout FROM configuracao_dashboard WHERE usuario_cpf=$1', [req.uid]))[0]?.layout || ['resumo', 'ranking', 'diario', 'categorias'])));
app.put('/api/dashboard-config', h(async (req, res) => {
  await q('INSERT INTO configuracao_dashboard(usuario_cpf,layout) VALUES($1,$2) ON CONFLICT(usuario_cpf) DO UPDATE SET layout=$2', [req.uid, JSON.stringify(req.body.layout || [])]);
  res.json({ ok: true });
}));

// RF01 - equipamentos (RN01, RN03, RN06)
const EQ = 'SELECT e.id,e.nome,e.categoria_id,c.nome AS categoria,e.potencia_w::float AS potencia_w,e.horas_uso_estimadas::float AS horas_uso_estimadas FROM equipamento e JOIN categoria c ON c.id=e.categoria_id';
const valida = b => b.nome?.trim() && num(b.categoria_id) && num(b.potencia_w) > 0 && num(b.horas_uso_estimadas) >= 0 && num(b.horas_uso_estimadas) <= 24;
app.get('/api/equipamentos', h(async (req, res) => res.json(await q(EQ + ' WHERE e.usuario_cpf=$1 ORDER BY e.nome', [req.uid]))));
app.post('/api/equipamentos', h(async (req, res) => {
  const b = req.body; if (!valida(b)) return res.status(400).json({ erro: 'Informe nome, categoria, potência (>0) e horas de uso (0 a 24)' });
  res.json((await q('INSERT INTO equipamento(usuario_cpf,categoria_id,nome,potencia_w,horas_uso_estimadas) VALUES($1,$2,$3,$4,$5) RETURNING id', [req.uid, b.categoria_id, b.nome.trim(), b.potencia_w, b.horas_uso_estimadas]))[0]);
}));
app.put('/api/equipamentos/:id', h(async (req, res) => {
  const b = req.body; if (!valida(b)) return res.status(400).json({ erro: 'Dados inválidos ou incompletos' });
  await q('UPDATE equipamento SET categoria_id=$1,nome=$2,potencia_w=$3,horas_uso_estimadas=$4 WHERE id=$5 AND usuario_cpf=$6', [b.categoria_id, b.nome.trim(), b.potencia_w, b.horas_uso_estimadas, req.params.id, req.uid]);
  res.json({ ok: true });
}));
app.delete('/api/equipamentos/:id', h(async (req, res) => { await q('DELETE FROM equipamento WHERE id=$1 AND usuario_cpf=$2', [req.params.id, req.uid]); res.json({ ok: true }); }));

// RF02/RF06 - simulação: horas variam ±30% em torno do uso estimado; kWh = W × h / 1000 (RN02)
app.post('/api/simulacao', h(async (req, res) => {
  const { inicio, fim } = req.body;
  if (!inicio || !fim || inicio > fim) return res.status(400).json({ erro: 'Período inválido' });
  const [{ tarifa }] = await q('SELECT tarifa_kwh::float AS tarifa FROM usuario WHERE cpf=$1', [req.uid]);
  const eqs = await q('SELECT id,potencia_w::float AS w,horas_uso_estimadas::float AS hrs FROM equipamento WHERE usuario_cpf=$1', [req.uid]);
  if (!eqs.length) return res.status(400).json({ erro: 'Cadastre ao menos um equipamento' });
  let n = 0;
  for (let d = new Date(inicio + 'T12:00'); iso(d) <= fim; d.setDate(d.getDate() + 1)) for (const e of eqs) {
    const horas = Math.min(24, +(e.hrs * (0.7 + Math.random() * 0.6)).toFixed(2)), kwh = e.w * horas / 1000;
    await q('INSERT INTO registro_consumo(equipamento_id,data,horas_utilizadas,consumo_kwh,custo_estimado) VALUES($1,$2,$3,$4,$5) ON CONFLICT(equipamento_id,data) DO UPDATE SET horas_utilizadas=$3,consumo_kwh=$4,custo_estimado=$5', [e.id, iso(d), horas, kwh, kwh * tarifa]); n++;
  }
  res.json({ registros: n });
}));

// RF03/RF04 - consumo e custo no período selecionado (RN04)
async function resumo(uid, ini, fim) {
  const equipamentos = await q(`SELECT e.id,e.nome,c.nome AS categoria,e.potencia_w::float AS potencia_w,COALESCE(SUM(r.consumo_kwh),0)::float AS kwh,COALESCE(SUM(r.custo_estimado),0)::float AS custo
    FROM equipamento e JOIN categoria c ON c.id=e.categoria_id LEFT JOIN registro_consumo r ON r.equipamento_id=e.id AND r.data BETWEEN $2 AND $3
    WHERE e.usuario_cpf=$1 GROUP BY e.id,c.nome ORDER BY kwh DESC`, [uid, ini, fim]);
  const dias = await q(`SELECT to_char(r.data,'YYYY-MM-DD') AS dia,SUM(r.consumo_kwh)::float AS kwh,SUM(r.custo_estimado)::float AS custo FROM registro_consumo r JOIN equipamento e ON e.id=r.equipamento_id
    WHERE e.usuario_cpf=$1 AND r.data BETWEEN $2 AND $3 GROUP BY r.data ORDER BY r.data`, [uid, ini, fim]);
  const cats = {}; equipamentos.forEach(e => cats[e.categoria] = (cats[e.categoria] || 0) + e.kwh);
  return { equipamentos, dias, categorias: Object.entries(cats).filter(([, v]) => v > 0).map(([nome, kwh]) => ({ nome, kwh })),
    total_kwh: equipamentos.reduce((s, e) => s + e.kwh, 0), total_custo: equipamentos.reduce((s, e) => s + e.custo, 0) };
}
app.get('/api/dashboard', h(async (req, res) => res.json(await resumo(req.uid, ...periodo('inicio', 'fim', req.query)))));

// RF05 - análise por regras e indicadores (sem modelo de IA)
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
app.get('/api/analise', h(async (req, res) => {
  const r = await resumo(req.uid, ...periodo('inicio', 'fim', req.query));
  const [{ tarifa }] = await q('SELECT tarifa_kwh::float AS tarifa FROM usuario WHERE cpf=$1', [req.uid]);
  if (!r.total_kwh) return res.json(['Gere dados simulados para o período selecionado para ver recomendações.']);
  const rec = [], top = r.equipamentos[0], p = top.kwh / r.total_kwh * 100;
  rec.push(`${top.nome} é o maior consumidor: ${p.toFixed(0)}% do consumo do período (${top.kwh.toFixed(1)} kWh).`);
  if (p > 40) rec.push(`Reduzir 1 hora de uso por dia de ${top.nome} economizaria cerca de R$ ${(top.potencia_w / 1000 * tarifa * r.dias.length).toFixed(2)} no período.`);
  const sem = Array(7).fill(0), cnt = Array(7).fill(0);
  r.dias.forEach(d => { const w = new Date(d.dia + 'T12:00').getDay(); sem[w] += d.kwh; cnt[w]++; });
  const med = sem.map((v, i) => cnt[i] ? v / cnt[i] : 0), pico = med.indexOf(Math.max(...med));
  rec.push(`O dia de maior consumo médio é ${SEMANA[pico]} (${med[pico].toFixed(1)} kWh por dia). Concentre tarefas que podem esperar em dias mais leves.`);
  const c = [...r.categorias].sort((a, b) => b.kwh - a.kwh)[0];
  if (c && c.kwh / r.total_kwh > 0.5) rec.push(`A categoria ${c.nome} responde por mais da metade do consumo. Vale revisar o uso e a eficiência desses equipamentos.`);
  const fraco = r.equipamentos.filter(e => e.kwh > 0 && e.kwh / r.total_kwh < 0.05).length;
  if (fraco) rec.push(`${fraco} equipamento(s) pesam menos de 5% cada: priorize a economia nos maiores consumidores.`);
  res.json(rec);
}));

// RF07 - relatório e comparação entre dois períodos
app.get('/api/relatorio', h(async (req, res) => {
  const a = await resumo(req.uid, ...periodo('a_inicio', 'a_fim', req.query)), b = await resumo(req.uid, ...periodo('b_inicio', 'b_fim', req.query));
  const mapB = Object.fromEntries(b.equipamentos.map(e => [e.id, e]));
  res.json({ a: { total_kwh: a.total_kwh, total_custo: a.total_custo }, b: { total_kwh: b.total_kwh, total_custo: b.total_custo },
    maior_consumidor_a: a.equipamentos[0]?.kwh ? a.equipamentos[0].nome : null,
    equipamentos: a.equipamentos.map(e => ({ nome: e.nome, categoria: e.categoria, kwh_a: e.kwh, custo_a: e.custo, kwh_b: mapB[e.id]?.kwh || 0, custo_b: mapB[e.id]?.custo || 0 })) });
}));
app.listen(3001, () => console.log('API em http://localhost:3001'));
