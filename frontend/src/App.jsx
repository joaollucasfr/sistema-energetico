import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
const API = import.meta.env.VITE_API || `http://${location.hostname}:3001`;
const api = async (path, method = 'GET', body) => {
  const r = await fetch(API + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && localStorage.getItem('token')) { localStorage.removeItem('token'); location.reload(); }
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado');
  return d;
};
const iso = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const kwh = v => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kWh';
const COR = ['#1f7a4d', '#c98a12', '#3b6ea5', '#a04a4a', '#6b5b95', '#4a8f8f', '#8a8a3a'];

function Periodo({ p, set, rotulo = '' }) {
  return <div className="row"><label>{rotulo} Início<input type="date" value={p[0]} onChange={e => set([e.target.value, p[1]])} /></label>
    <label>Fim<input type="date" value={p[1]} onChange={e => set([p[0], e.target.value])} /></label></div>;
}
function Login({ entrou }) {
  const [novo, setNovo] = useState(false), [f, setF] = useState({}), [erro, setErro] = useState('');
  const enviar = async () => { try { const d = await api(novo ? '/auth/register' : '/auth/login', 'POST', f); localStorage.setItem('token', d.token); entrou(); } catch (e) { setErro(e.message); } };
  return <main style={{ maxWidth: 420 }}><div className="card"><h2>{novo ? 'Criar conta' : 'Entrar'}</h2>
    <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      {novo && <label>Nome<input onChange={e => setF({ ...f, nome: e.target.value })} /></label>}
      <label>E-mail<input type="email" onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label>Senha<input type="password" onChange={e => setF({ ...f, senha: e.target.value })} /></label>
      {erro && <div className="err">{erro}</div>}
      <button className="btn" onClick={enviar}>{novo ? 'Criar conta' : 'Entrar'}</button>
      <button className="btn sec" onClick={() => { setNovo(!novo); setErro(''); }}>{novo ? 'Já tenho conta' : 'Criar uma conta'}</button>
    </div></div></main>;
}
function Equipamentos() {
  const vazio = { nome: '', categoria_id: '', potencia_w: '', horas_uso_estimadas: '' };
  const [lista, setLista] = useState([]), [cats, setCats] = useState([]), [f, setF] = useState(vazio), [id, setId] = useState(null), [erro, setErro] = useState('');
  const carregar = useCallback(() => api('/equipamentos').then(setLista), []);
  useEffect(() => { carregar(); api('/categorias').then(setCats); }, [carregar]);
  const salvar = async () => { try { await api(id ? '/equipamentos/' + id : '/equipamentos', id ? 'PUT' : 'POST', f); setF(vazio); setId(null); setErro(''); carregar(); } catch (e) { setErro(e.message); } };
  const inp = (k, t = 'text') => <input type={t} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />;
  return <>
    <div className="card"><h2>{id ? 'Editar equipamento' : 'Novo equipamento'}</h2>
      <div className="row"><label>Nome{inp('nome')}</label>
        <label>Categoria<select value={f.categoria_id} onChange={e => setF({ ...f, categoria_id: e.target.value })}><option value="">Escolha</option>{cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label>Potência (W){inp('potencia_w', 'number')}</label><label>Horas de uso por dia{inp('horas_uso_estimadas', 'number')}</label>
        <button className="btn" onClick={salvar}>{id ? 'Salvar alterações' : 'Adicionar'}</button>
        {id && <button className="btn sec" onClick={() => { setId(null); setF(vazio); }}>Cancelar</button>}</div>
      {erro && <p className="err">{erro}</p>}</div>
    <div className="card scroll"><table><thead><tr><th>Nome</th><th>Categoria</th><th>Potência</th><th>Horas/dia</th><th></th></tr></thead><tbody>
      {lista.map(e => <tr key={e.id}><td>{e.nome}</td><td>{e.categoria}</td><td>{e.potencia_w} W</td><td>{e.horas_uso_estimadas}</td><td>
        <button className="btn sec" onClick={() => { setId(e.id); setF({ nome: e.nome, categoria_id: e.categoria_id, potencia_w: e.potencia_w, horas_uso_estimadas: e.horas_uso_estimadas }); }}>Editar</button>{' '}
        <button className="btn sec" onClick={() => confirm('Excluir ' + e.nome + '?') && api('/equipamentos/' + e.id, 'DELETE').then(carregar)}>Excluir</button></td></tr>)}
    </tbody></table>{!lista.length && <p className="mut">Nenhum equipamento ainda. Adicione o primeiro acima.</p>}</div></>;
}
function Simulacao({ per, setPer }) {
  const [tarifa, setTarifa] = useState(''), [msg, setMsg] = useState('');
  useEffect(() => { api('/me').then(m => setTarifa(m.tarifa_kwh)); }, []);
  const ok = async fn => { try { setMsg(await fn()); } catch (e) { setMsg(e.message); } };
  return <><div className="card"><h2>Tarifa de energia</h2><div className="row"><label>Valor por kWh (R$)<input type="number" step="0.01" value={tarifa} onChange={e => setTarifa(e.target.value)} /></label>
    <button className="btn" onClick={() => ok(async () => { await api('/me', 'PUT', { tarifa_kwh: tarifa }); return 'Tarifa salva. Os custos foram recalculados.'; })}>Salvar tarifa</button></div></div>
    <div className="card"><h2>Gerar dados simulados</h2><p className="mut">Cria o consumo diário de cada equipamento no período, variando cerca de 30% em torno do uso informado. Dados existentes no período são substituídos.</p>
      <Periodo p={per} set={setPer} /><p><button className="btn" onClick={() => ok(async () => `${(await api('/simulacao', 'POST', { inicio: per[0], fim: per[1] })).registros} registros gerados.`)}>Gerar simulação</button></p></div>
    {msg && <p>{msg}</p>}</>;
}
function Dashboard({ per, setPer }) {
  const [d, setD] = useState(null), [lay, setLay] = useState([]);
  useEffect(() => { api('/dashboard?inicio=' + per[0] + '&fim=' + per[1]).then(setD); }, [per]);
  useEffect(() => { api('/dashboard-config').then(setLay); }, []);
  const WID = { resumo: 'Resumo', ranking: 'Ranking de equipamentos', diario: 'Histórico diário', categorias: 'Por categoria' };
  const alterna = k => { const n = lay.includes(k) ? lay.filter(x => x !== k) : [...lay, k]; setLay(n); api('/dashboard-config', 'PUT', { layout: n }); };
  if (!d) return <p>Carregando…</p>;
  const sem = !d.total_kwh;
  return <><div className="card"><Periodo p={per} set={setPer} /><p className="mut" style={{ marginBottom: 0 }}>Exibir: {Object.entries(WID).map(([k, v]) => <label key={k} style={{ marginRight: 12 }}><input type="checkbox" checked={lay.includes(k)} onChange={() => alterna(k)} /> {v}</label>)}</p></div>
    {sem && <div className="card">Sem dados no período. Cadastre equipamentos e gere uma simulação.</div>}
    {lay.includes('resumo') && <div className="grid"><div className="card"><div className="mut">Consumo total</div><div className="big">{kwh(d.total_kwh)}</div></div>
      <div className="card"><div className="mut">Custo estimado</div><div className="big">{brl(d.total_custo)}</div></div>
      <div className="card"><div className="mut">Maior consumidor</div><div className="big" style={{ fontSize: '1.5rem' }}>{sem ? '—' : d.equipamentos[0].nome}</div></div></div>}
    {!sem && lay.includes('ranking') && <div className="card"><h3>Ranking de equipamentos (kWh)</h3><ResponsiveContainer width="100%" height={30 + d.equipamentos.length * 36}>
      <BarChart data={d.equipamentos} layout="vertical" margin={{ left: 20 }}><XAxis type="number" /><YAxis type="category" dataKey="nome" width={110} /><Tooltip formatter={v => kwh(v)} /><Bar dataKey="kwh" fill="#1f7a4d" /></BarChart></ResponsiveContainer></div>}
    {!sem && lay.includes('diario') && <div className="card"><h3>Histórico diário (kWh)</h3><ResponsiveContainer width="100%" height={240}>
      <LineChart data={d.dias}><XAxis dataKey="dia" tickFormatter={s => s.slice(5)} /><YAxis /><Tooltip formatter={v => kwh(v)} /><Line dataKey="kwh" stroke="#c98a12" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>}
    {!sem && lay.includes('categorias') && <div className="card"><h3>Consumo por categoria</h3><ResponsiveContainer width="100%" height={260}>
      <PieChart><Pie data={d.categorias} dataKey="kwh" nameKey="nome" label={e => e.nome}>{d.categorias.map((_, i) => <Cell key={i} fill={COR[i % COR.length]} />)}</Pie><Tooltip formatter={v => kwh(v)} /></PieChart></ResponsiveContainer></div>}</>;
}
function Relatorios({ per }) {
  const dias = Math.round((new Date(per[1]) - new Date(per[0])) / 864e5) + 1;
  const [b, setB] = useState([new Date(new Date(per[0]) - dias * 864e5).toISOString().slice(0, 10), new Date(new Date(per[0]) - 864e5).toISOString().slice(0, 10)]), [r, setR] = useState(null);
  useEffect(() => { api(`/relatorio?a_inicio=${per[0]}&a_fim=${per[1]}&b_inicio=${b[0]}&b_fim=${b[1]}`).then(setR); }, [per, b]);
  const dif = (a, c) => c ? ((a - c) / c * 100).toFixed(0) + '%' : '—';
  return <><div className="card"><h3>Período A (selecionado: {per[0]} a {per[1]})</h3><Periodo p={b} set={setB} rotulo="Período B:" /></div>
    {r && <div className="card scroll"><p>Maior consumidor no período A: <b>{r.maior_consumidor_a || '—'}</b>. Total A: {kwh(r.a.total_kwh)} ({brl(r.a.total_custo)}). Total B: {kwh(r.b.total_kwh)} ({brl(r.b.total_custo)}). Variação: {dif(r.a.total_kwh, r.b.total_kwh)}.</p>
      <table><thead><tr><th>Equipamento</th><th>Categoria</th><th>kWh A</th><th>kWh B</th><th>Variação</th><th>Custo A</th></tr></thead><tbody>
        {r.equipamentos.map(e => <tr key={e.nome}><td>{e.nome}</td><td>{e.categoria}</td><td>{kwh(e.kwh_a)}</td><td>{kwh(e.kwh_b)}</td><td>{dif(e.kwh_a, e.kwh_b)}</td><td>{brl(e.custo_a)}</td></tr>)}</tbody></table></div>}</>;
}
function Recomendacoes({ per, setPer }) {
  const [r, setR] = useState([]);
  useEffect(() => { api('/analise?inicio=' + per[0] + '&fim=' + per[1]).then(setR); }, [per]);
  return <><div className="card"><Periodo p={per} set={setPer} /></div><div className="card"><h2>Recomendações</h2><ul>{r.map((t, i) => <li key={i}>{t}</li>)}</ul></div></>;
}
export default function App() {
  const [logado, setLogado] = useState(!!localStorage.getItem('token')), [aba, setAba] = useState('Dashboard'), [per, setPer] = useState([iso(29), iso(0)]);
  if (!logado) return <Login entrou={() => setLogado(true)} />;
  const abas = { Dashboard: <Dashboard per={per} setPer={setPer} />, Equipamentos: <Equipamentos />, 'Simulação': <Simulacao per={per} setPer={setPer} />, 'Relatórios': <Relatorios per={per} />, 'Recomendações': <Recomendacoes per={per} setPer={setPer} /> };
  return <><nav><b>Monitor de Energia</b>{Object.keys(abas).map(a => <button key={a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>{a}</button>)}
    <button onClick={() => { localStorage.removeItem('token'); setLogado(false); }}>Sair</button></nav><main>{abas[aba]}</main></>;
}
