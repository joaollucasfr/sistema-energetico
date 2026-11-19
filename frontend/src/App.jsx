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
const fmtCpf = v => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const TITULO = { entrar: 'Entrar', criar: 'Criar conta', esqueci: 'Esqueci minha senha', redefinir: 'Criar nova senha', '2fa': 'Verificação em duas etapas' };
function Login({ entrou }) {
  const [modo, setModo] = useState('entrar'), [f, setF] = useState({}), [erro, setErro] = useState(''), [aviso, setAviso] = useState(''), [t2fa, setT2fa] = useState(''), [rec, setRec] = useState(null);
  const ir = (m, manter) => { setModo(m); setErro(''); setAviso(''); if (!manter) setF({}); };
  const campo = (k, rotulo, { mask, ...props } = {}) => <label>{rotulo}<input value={f[k] || ''} onChange={e => setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value })} {...props} /></label>;
  const logar = d => { localStorage.setItem('token', d.token); entrou(); };
  const enviar = async e => {
    e.preventDefault(); setErro('');
    try {
      if (modo === 'entrar') { const d = await api('/auth/login', 'POST', { login: f.login, senha: f.senha }); if (d.precisa_2fa) { setT2fa(d.token_2fa); ir('2fa'); } else logar(d); }
      if (modo === 'criar') logar(await api('/auth/register', 'POST', f));
      if (modo === '2fa') logar(await api('/auth/login/2fa', 'POST', { token_2fa: t2fa, codigo: f.codigo }));
      if (modo === 'esqueci') { setRec(await api('/auth/recuperar', 'POST', { cpf: f.cpf })); ir('redefinir', true); }
      if (modo === 'redefinir') {
        if (f.senha !== f.senha2) return setErro('As senhas não conferem');
        await api('/auth/redefinir-senha', 'POST', { cpf: f.cpf, codigo: f.codigo, senha: f.senha });
        ir('entrar'); setAviso('Senha alterada. Entre com a nova senha.');
      }
    } catch (e) { setErro(e.message); }
  };
  return <main className="login"><form className="card" onSubmit={enviar}><div className="marca">⚡ Monitor de Energia</div><h2>{TITULO[modo]}</h2>
    <div className="row col">
      {modo === 'entrar' && <>{campo('login', 'E-mail ou CPF', { autoComplete: 'username' })}{campo('senha', 'Senha', { type: 'password', autoComplete: 'current-password' })}</>}
      {modo === 'criar' && <>{campo('nome', 'Nome')}{campo('cpf', 'CPF', { mask: fmtCpf, inputMode: 'numeric', placeholder: '000.000.000-00' })}{campo('email', 'E-mail', { type: 'email' })}{campo('senha', 'Senha (6+ caracteres)', { type: 'password', autoComplete: 'new-password' })}</>}
      {modo === 'esqueci' && <><p className="mut">Informe o CPF da sua conta para criar uma nova senha.</p>{campo('cpf', 'CPF', { mask: fmtCpf, inputMode: 'numeric', placeholder: '000.000.000-00', autoFocus: true })}</>}
      {modo === 'redefinir' && <><p className="mut">Conta do CPF {f.cpf}.</p>
        {rec?.precisa_2fa && campo('codigo', 'Código do app autenticador (2FA)', { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, autoFocus: true })}
        {campo('senha', 'Nova senha (6+ caracteres)', { type: 'password', autoComplete: 'new-password' })}{campo('senha2', 'Repita a nova senha', { type: 'password', autoComplete: 'new-password' })}</>}
      {modo === '2fa' && <><p className="mut">Digite o código de 6 dígitos do seu app autenticador.</p>{campo('codigo', 'Código', { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, autoFocus: true })}</>}
      {erro && <div className="err">{erro}</div>}{aviso && <div className="ok">{aviso}</div>}
      <button className="btn">{{ entrar: 'Entrar', criar: 'Criar conta', esqueci: 'Continuar', redefinir: 'Salvar nova senha', '2fa': 'Verificar' }[modo]}</button>
      {modo === 'entrar' && <><button type="button" className="link" onClick={() => ir('esqueci')}>Esqueci minha senha</button><button type="button" className="btn sec" onClick={() => ir('criar')}>Criar uma conta</button></>}
      {modo !== 'entrar' && <button type="button" className="btn sec" onClick={() => ir('entrar')}>Voltar para o login</button>}
    </div></form></main>;
}
function Conta() {
  const [me, setMe] = useState(null), [qr, setQr] = useState(null), [codigo, setCodigo] = useState(''), [msg, setMsg] = useState(''), [erro, setErro] = useState('');
  const carregar = useCallback(() => api('/me').then(setMe), []);
  useEffect(() => { carregar(); }, [carregar]);
  const acao = async fn => { setErro(''); setMsg(''); try { await fn(); } catch (e) { setErro(e.message); } };
  if (!me) return <p>Carregando…</p>;
  return <><div className="card"><h2>Minha conta</h2><table><tbody><tr><th>Nome</th><td>{me.nome}</td></tr><tr><th>CPF</th><td>{fmtCpf(me.cpf)}</td></tr><tr><th>E-mail</th><td>{me.email}</td></tr></tbody></table></div>
    <div className="card"><h2>Verificação em duas etapas (2FA)</h2>
      <p>Status: {me.totp_ativo ? <span className="tag on">Ativa</span> : <span className="tag">Desativada</span>}</p>
      {!me.totp_ativo && !qr && <><p className="mut">Além da senha, o login vai pedir um código do seu celular (Google Authenticator, Microsoft Authenticator, Authy…).</p>
        <button className="btn" onClick={() => acao(async () => setQr(await api('/2fa/iniciar', 'POST')))}>Ativar 2FA</button></>}
      {!me.totp_ativo && qr && <><p>1. Escaneie o QR code no app autenticador:</p><img src={qr.qr} alt="QR code para o app autenticador" width="200" height="200" />
        <p className="mut">Não consegue escanear? Digite esta chave no app: <code>{qr.secret}</code></p>
        <div className="row"><label>2. Código de 6 dígitos<input inputMode="numeric" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value)} /></label>
          <button className="btn" onClick={() => acao(async () => { await api('/2fa/ativar', 'POST', { codigo }); setQr(null); setCodigo(''); setMsg('2FA ativada. No próximo login o código será pedido.'); carregar(); })}>Confirmar</button>
          <button className="btn sec" onClick={() => { setQr(null); setCodigo(''); }}>Cancelar</button></div></>}
      {me.totp_ativo && <div className="row"><label>Código atual do app<input inputMode="numeric" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value)} /></label>
        <button className="btn sec" onClick={() => acao(async () => { await api('/2fa/desativar', 'POST', { codigo }); setCodigo(''); setMsg('2FA desativada.'); carregar(); })}>Desativar 2FA</button></div>}
      {erro && <p className="err">{erro}</p>}{msg && <p className="ok">{msg}</p>}</div></>;
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
  const [gerando, setGerando] = useState(false);
  const pdf = async () => {
    setGerando(true);
    try {
      const [{ jsPDF }, { default: autoTable }, me] = await Promise.all([import('jspdf'), import('jspdf-autotable'), api('/me')]);
      const doc = new jsPDF(), br = s => s.split('-').reverse().join('/'), verde = [31, 122, 77];
      doc.setFillColor(...verde); doc.rect(0, 0, 210, 24, 'F'); doc.setTextColor(255); doc.setFontSize(16); doc.text('Monitor de Energia - Relatório de consumo', 14, 15);
      doc.setTextColor(40); doc.setFontSize(10);
      doc.text([`Usuário: ${me.nome}`, `Gerado em: ${new Date().toLocaleString('pt-BR')}`, `Tarifa: ${brl(me.tarifa_kwh)} por kWh`,
        `Período A: ${br(per[0])} a ${br(per[1])}    Período B: ${br(b[0])} a ${br(b[1])}`], 14, 32);
      autoTable(doc, { startY: 54, head: [['Resumo', 'Período A', 'Período B', 'Variação']], headStyles: { fillColor: verde },
        body: [['Consumo', kwh(r.a.total_kwh), kwh(r.b.total_kwh), dif(r.a.total_kwh, r.b.total_kwh)], ['Custo estimado', brl(r.a.total_custo), brl(r.b.total_custo), dif(r.a.total_custo, r.b.total_custo)],
          ['Maior consumidor (A)', r.maior_consumidor_a || '—', '', '']] });
      autoTable(doc, { startY: doc.lastAutoTable.finalY + 8, headStyles: { fillColor: verde }, head: [['Equipamento', 'Categoria', 'kWh A', 'kWh B', 'Variação', 'Custo A', 'Custo B']],
        body: r.equipamentos.map(e => [e.nome, e.categoria, kwh(e.kwh_a), kwh(e.kwh_b), dif(e.kwh_a, e.kwh_b), brl(e.custo_a), brl(e.custo_b)]) });
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${n}`, 196, 290, { align: 'right' }); }
      doc.save(`relatorio-energia-${per[0]}-a-${per[1]}.pdf`);
    } finally { setGerando(false); }
  };
  return <><div className="card"><h3>Período A (selecionado: {per[0]} a {per[1]})</h3><Periodo p={b} set={setB} rotulo="Período B:" />
    <p style={{ marginBottom: 0 }}><button className="btn" disabled={!r || gerando} onClick={pdf}>{gerando ? 'Gerando PDF…' : 'Exportar PDF'}</button></p></div>
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
  const abas = { Dashboard: <Dashboard per={per} setPer={setPer} />, Equipamentos: <Equipamentos />, 'Simulação': <Simulacao per={per} setPer={setPer} />, 'Relatórios': <Relatorios per={per} />, 'Recomendações': <Recomendacoes per={per} setPer={setPer} />, Conta: <Conta /> };
  return <><nav><b>Monitor de Energia</b>{Object.keys(abas).map(a => <button key={a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>{a}</button>)}
    <button onClick={() => { localStorage.removeItem('token'); setLogado(false); }}>Sair</button></nav><main>{abas[aba]}</main></>;
}
