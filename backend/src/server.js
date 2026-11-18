import express from 'express'; import cors from 'cors'; import pg from 'pg'; import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://energia:energia@localhost:5432/energia' });
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express(); app.use(cors(), express.json());
const q = (t, p) => pool.query(t, p).then(r => r.rows);
const h = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ erro: 'Erro interno do servidor' }); });
const auth = (req, res, next) => { try { req.uid = jwt.verify((req.headers.authorization || '').slice(7), SECRET).uid; next(); } catch { res.status(401).json({ erro: 'Faça login para continuar' }); } };
const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);
const iso = d => d.toISOString().slice(0, 10);
const periodo = (a, b, qr) => [qr[a] || iso(new Date(Date.now() - 29 * 864e5)), qr[b] || iso(new Date())];

app.post('/api/auth/register', h(async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome, e-mail e senha com 6+ caracteres' });
  if ((await q('SELECT 1 FROM usuario WHERE email=$1', [email])).length) return res.status(409).json({ erro: 'E-mail já cadastrado' });
  const [u] = await q('INSERT INTO usuario(nome,email,senha_hash) VALUES($1,$2,$3) RETURNING id', [nome, email, await bcrypt.hash(senha, 10)]);
  res.json({ token: jwt.sign({ uid: u.id }, SECRET, { expiresIn: '7d' }) });
}));
app.post('/api/auth/login', h(async (req, res) => {
  const [u] = await q('SELECT * FROM usuario WHERE email=$1', [req.body.email]);
  if (!u || !(await bcrypt.compare(req.body.senha || '', u.senha_hash))) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  res.json({ token: jwt.sign({ uid: u.id }, SECRET, { expiresIn: '7d' }) });
}));

app.use('/api', auth);
app.get('/api/me', h(async (req, res) => res.json((await q('SELECT nome,email,tarifa_kwh::float AS tarifa_kwh FROM usuario WHERE id=$1', [req.uid]))[0])));
app.put('/api/me', h(async (req, res) => {
  const t = num(req.body.tarifa_kwh);
  if (t === null || t <= 0) return res.status(400).json({ erro: 'Tarifa deve ser maior que zero' });
  await q('UPDATE usuario SET tarifa_kwh=$1 WHERE id=$2', [t, req.uid]);
  await q('UPDATE registro_consumo SET custo_estimado=consumo_kwh*$1 WHERE equipamento_id IN (SELECT id FROM equipamento WHERE usuario_id=$2)', [t, req.uid]);
  res.json({ ok: true });
}));
app.get('/api/categorias', h(async (_, res) => res.json(await q('SELECT * FROM categoria ORDER BY nome'))));
app.get('/api/dashboard-config', h(async (req, res) => res.json((await q('SELECT layout FROM configuracao_dashboard WHERE usuario_id=$1', [req.uid]))[0]?.layout || ['resumo', 'ranking', 'diario', 'categorias'])));
app.put('/api/dashboard-config', h(async (req, res) => {
  await q('INSERT INTO configuracao_dashboard(usuario_id,layout) VALUES($1,$2) ON CONFLICT(usuario_id) DO UPDATE SET layout=$2', [req.uid, JSON.stringify(req.body.layout || [])]);
  res.json({ ok: true });
}));

// RF01 - equipamentos (RN01, RN03, RN06)
const EQ = 'SELECT e.id,e.nome,e.categoria_id,c.nome AS categoria,e.potencia_w::float AS potencia_w,e.horas_uso_estimadas::float AS horas_uso_estimadas FROM equipamento e JOIN categoria c ON c.id=e.categoria_id';
const valida = b => b.nome?.trim() && num(b.categoria_id) && num(b.potencia_w) > 0 && num(b.horas_uso_estimadas) >= 0 && num(b.horas_uso_estimadas) <= 24;
app.get('/api/equipamentos', h(async (req, res) => res.json(await q(EQ + ' WHERE e.usuario_id=$1 ORDER BY e.nome', [req.uid]))));
app.post('/api/equipamentos', h(async (req, res) => {
  const b = req.body; if (!valida(b)) return res.status(400).json({ erro: 'Informe nome, categoria, potência (>0) e horas de uso (0 a 24)' });
  res.json((await q('INSERT INTO equipamento(usuario_id,categoria_id,nome,potencia_w,horas_uso_estimadas) VALUES($1,$2,$3,$4,$5) RETURNING id', [req.uid, b.categoria_id, b.nome.trim(), b.potencia_w, b.horas_uso_estimadas]))[0]);
}));
app.put('/api/equipamentos/:id', h(async (req, res) => {
  const b = req.body; if (!valida(b)) return res.status(400).json({ erro: 'Dados inválidos ou incompletos' });
  await q('UPDATE equipamento SET categoria_id=$1,nome=$2,potencia_w=$3,horas_uso_estimadas=$4 WHERE id=$5 AND usuario_id=$6', [b.categoria_id, b.nome.trim(), b.potencia_w, b.horas_uso_estimadas, req.params.id, req.uid]);
  res.json({ ok: true });
}));
app.delete('/api/equipamentos/:id', h(async (req, res) => { await q('DELETE FROM equipamento WHERE id=$1 AND usuario_id=$2', [req.params.id, req.uid]); res.json({ ok: true }); }));

// RF02/RF06 - simulação: horas variam ±30% em torno do uso estimado; kWh = W × h / 1000 (RN02)
app.post('/api/simulacao', h(async (req, res) => {
  const { inicio, fim } = req.body;
  if (!inicio || !fim || inicio > fim) return res.status(400).json({ erro: 'Período inválido' });
  const [{ tarifa }] = await q('SELECT tarifa_kwh::float AS tarifa FROM usuario WHERE id=$1', [req.uid]);
  const eqs = await q('SELECT id,potencia_w::float AS w,horas_uso_estimadas::float AS hrs FROM equipamento WHERE usuario_id=$1', [req.uid]);
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
    WHERE e.usuario_id=$1 GROUP BY e.id,c.nome ORDER BY kwh DESC`, [uid, ini, fim]);
  const dias = await q(`SELECT to_char(r.data,'YYYY-MM-DD') AS dia,SUM(r.consumo_kwh)::float AS kwh,SUM(r.custo_estimado)::float AS custo FROM registro_consumo r JOIN equipamento e ON e.id=r.equipamento_id
    WHERE e.usuario_id=$1 AND r.data BETWEEN $2 AND $3 GROUP BY r.data ORDER BY r.data`, [uid, ini, fim]);
  const cats = {}; equipamentos.forEach(e => cats[e.categoria] = (cats[e.categoria] || 0) + e.kwh);
  return { equipamentos, dias, categorias: Object.entries(cats).filter(([, v]) => v > 0).map(([nome, kwh]) => ({ nome, kwh })),
    total_kwh: equipamentos.reduce((s, e) => s + e.kwh, 0), total_custo: equipamentos.reduce((s, e) => s + e.custo, 0) };
}
app.get('/api/dashboard', h(async (req, res) => res.json(await resumo(req.uid, ...periodo('inicio', 'fim', req.query)))));

// RF05 - análise por regras e indicadores (sem modelo de IA)
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
app.get('/api/analise', h(async (req, res) => {
  const r = await resumo(req.uid, ...periodo('inicio', 'fim', req.query));
  const [{ tarifa }] = await q('SELECT tarifa_kwh::float AS tarifa FROM usuario WHERE id=$1', [req.uid]);
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
