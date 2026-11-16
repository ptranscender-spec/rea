import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Scale, MessagesSquare, Wallet, CalendarDays, LogOut, ArrowLeft, Upload, Download, FileText, MapPin, Moon, Sun, Phone, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { moeda, data, dataHora, utcParaLocal } from '../lib/format.js';
import { Campo, Carregando, Selo, Vazio, corStatusFin, corStatusProc, useAviso, useCarregar } from '../components/ui.jsx';
import { Logo, useTema } from '../components/Layout.jsx';
import Conversa, { useRepetir } from '../components/Conversa.jsx';

const Ctx = createContext(null);
const usePortal = () => useContext(Ctx);

export function PortalProvider({ children }) {
  const [s, setS] = useState({ carregando: true, cliente: null, escritorio: null });
  const atualizar = useCallback(async () => { const r = await api.get('/api/portal/eu'); setS({ carregando: false, cliente: r.cliente, escritorio: r.escritorio || null }); }, []);
  useEffect(() => { atualizar().catch(() => setS({ carregando: false, cliente: null, escritorio: null })); }, [atualizar]);
  const sair = async () => { await api.post('/api/portal/sair'); setS({ carregando: false, cliente: null, escritorio: null }); };
  return <Ctx.Provider value={{ ...s, atualizar, sair }}>{children}</Ctx.Provider>;
}

function Moldura({ children, titulo, subtitulo }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marinho-800 via-marinho-700 to-[#0d4a4a] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-1"><Logo claro /><span className="text-xs uppercase tracking-widest text-esmeralda-400">Portal do cliente</span></div>
        <div className="cartao space-y-4 p-6 sm:p-8">
          <div><h1 className="font-display text-2xl font-semibold">{titulo}</h1>{subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PortalEntrar() {
  const { cliente, atualizar } = usePortal();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (cliente) return <Navigate to="/portal" replace />;
  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true);
    try { await api.post('/api/portal/entrar', f); await atualizar(); nav('/portal'); } catch (err) { setErro(err.message); } finally { setOcupado(false); }
  };
  return (
    <Moldura titulo="Acompanhe seu processo" subtitulo="Entre com o e-mail cadastrado no escritório.">
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="E-mail"><input type="email" required className="campo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Campo>
        <Campo rotulo="Senha"><input type="password" required className="campo" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoComplete="current-password" /></Campo>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
        <button className="btn-primario w-full py-2.5" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-xs text-slate-500">Primeiro acesso ou esqueceu a senha? Peça ao escritório um novo link de acesso.</p>
      </form>
    </Moldura>
  );
}

export function PortalAtivar() {
  const { token } = useParams();
  const { atualizar } = usePortal();
  const nav = useNavigate();
  const { dados, erro: erroConvite, carregando } = useCarregar(() => api.get(`/api/portal/convite/${token}`), [token]);
  const [senha, setSenha] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState('');
  if (carregando) return <Carregando />;
  if (erroConvite) return <Moldura titulo="Link inválido" subtitulo={erroConvite.message}><Link to="/portal/entrar" className="btn-claro w-full">Ir para o login</Link></Moldura>;
  const enviar = async (e) => {
    e.preventDefault(); setErro('');
    if (senha !== conf) { setErro('As senhas não conferem.'); return; }
    try { await api.post('/api/portal/ativar', { token, senha }); await atualizar(); nav('/portal'); } catch (err) { setErro(err.message); }
  };
  return (
    <Moldura titulo={`Olá, ${dados.nome.split(' ')[0]}!`} subtitulo={`${dados.escritorio} liberou seu acesso ao portal. Crie uma senha para entrar.`}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Seu e-mail de acesso"><input className="campo" value={dados.email} disabled /></Campo>
        <Campo rotulo="Crie uma senha" dica="Mínimo de 8 caracteres."><input type="password" minLength={8} required className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></Campo>
        <Campo rotulo="Repita a senha"><input type="password" required className="campo" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" /></Campo>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
        <button className="btn-primario w-full py-2.5">Criar senha e entrar</button>
      </form>
    </Moldura>
  );
}

export function PortalLayout() {
  const { carregando, cliente, escritorio, sair } = usePortal();
  const [escuro, alternar] = useTema();
  const [naoLidas, setNaoLidas] = useState(0);
  const atualizarContagem = useCallback(() => api.get('/api/portal/resumo').then((r) => setNaoLidas(r.naoLidas)).catch(() => {}), []);
  useEffect(() => { if (cliente) atualizarContagem(); }, [cliente, atualizarContagem]);
  useRepetir(() => cliente && atualizarContagem(), 15000, [cliente]);
  useEffect(() => { const f = () => setNaoLidas(0); window.addEventListener('jn-portal-lidas', f); return () => window.removeEventListener('jn-portal-lidas', f); }, []);
  if (carregando) return <Carregando />;
  if (!cliente) return <Navigate to="/portal/entrar" replace />;
  const abas = [
    { to: '/portal', rotulo: 'Meus processos', icone: Scale, fim: true },
    { to: '/portal/mensagens', rotulo: 'Mensagens', icone: MessagesSquare, badge: naoLidas },
    { to: '/portal/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
  ];
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="bg-marinho-700 text-white dark:bg-marinho-900">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Logo claro className="text-lg" />
          <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wider text-esmeralda-400 sm:inline">Portal do cliente</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded-lg p-2 hover:bg-white/10" onClick={alternar} aria-label="Alternar tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm hover:bg-white/10" onClick={sair}><LogOut size={16} /><span className="hidden sm:inline">Sair</span></button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-5">
          <p className="text-sm text-marinho-200">{escritorio?.nome}</p>
          <h1 className="font-display text-2xl font-semibold text-white">Olá, {cliente.nome.split(' ')[0]}</h1>
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 sm:flex">
          {abas.map(({ to, rotulo, icone: I, fim, badge }) => (
            <NavLink key={to} to={to} end={fim} className={({ isActive }) => `flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium ${isActive ? 'bg-slate-50 text-marinho-700 dark:bg-marinho-950 dark:text-white' : 'text-marinho-100 hover:bg-white/10'}`}>
              <I size={16} />{rotulo}{badge > 0 && <span className="rounded-full bg-esmeralda-500 px-1.5 text-[11px] font-bold text-white">{badge}</span>}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white dark:border-marinho-800 dark:bg-marinho-900 sm:hidden">
        {abas.map(({ to, rotulo, icone: I, fim, badge }) => (
          <NavLink key={to} to={to} end={fim} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-esmeralda-600' : 'text-slate-500'}`}>
            <I size={20} />{rotulo}{badge > 0 && <span className="absolute right-[30%] top-1 h-2.5 w-2.5 rounded-full bg-esmeralda-500" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PortalInicio() {
  const { escritorio } = usePortal();
  const { dados, carregando } = useCarregar(() => api.get('/api/portal/resumo'), []);
  if (carregando || !dados) return <Carregando />;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <h2 className="text-lg font-semibold">Seus processos</h2>
        {!dados.processos.length ? <div className="cartao"><Vazio titulo="Nenhum processo vinculado ainda" texto="Assim que o escritório cadastrar seu caso, ele aparece aqui." /></div> : dados.processos.map((p) => (
          <Link key={p.id} to={`/portal/processos/${p.id}`} className="cartao block p-5 transition hover:border-esmeralda-500/60">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-semibold">{p.titulo}</p><p className="font-mono text-xs text-slate-500">{p.numero_cnj || 'Caso em andamento no escritório'}</p></div>
              <Selo cor={corStatusProc[p.status]}>{p.status}</Selo>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Área: <b className="font-medium text-slate-700 dark:text-slate-200">{p.area}</b></span><span>Fase: <b className="font-medium text-slate-700 dark:text-slate-200">{p.fase}</b></span>{p.responsavel_nome && <span>Advogado(a): <b className="font-medium text-slate-700 dark:text-slate-200">{p.responsavel_nome}</b></span>}</div>
            {p.ultimo_andamento && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-marinho-800/60">
                <p className="text-xs font-semibold text-esmeralda-600">Última atualização · {data(p.ultimo_andamento.data)}</p>
                <p className="mt-0.5 line-clamp-2">{p.ultimo_andamento.descricao}</p>
              </div>
            )}
          </Link>
        ))}
      </div>
      <div className="min-w-0 space-y-6">
        <section className="cartao">
          <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 font-semibold dark:border-marinho-800"><CalendarDays size={18} className="text-esmeralda-500" />Próximos compromissos</h2>
          {!dados.eventos.length ? <p className="px-5 py-6 text-sm text-slate-500">Nenhum compromisso agendado.</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-marinho-800">
              {dados.eventos.map((e) => (
                <li key={e.id} className="px-5 py-3"><p className="font-medium">{e.titulo}</p><p className="text-xs text-slate-500">{dataHora(e.inicio)}</p>{e.local && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{e.local}</p>}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="cartao space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Fale com o escritório</h2>
          <Link to="/portal/mensagens" className="btn-primario w-full"><MessagesSquare size={16} />Enviar mensagem{dados.naoLidas > 0 && ` (${dados.naoLidas} nova${dados.naoLidas > 1 ? 's' : ''})`}</Link>
          {escritorio?.telefone && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone size={14} />{escritorio.telefone}</p>}
          {escritorio?.email && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail size={14} />{escritorio.email}</p>}
        </section>
      </div>
    </div>
  );
}

export function PortalProcesso() {
  const { id } = useParams();
  const avisar = useAviso();
  const arq = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const { dados: p, carregando, erro, recarregar } = useCarregar(() => api.get(`/api/portal/processos/${id}`), [id]);
  if (carregando && !p) return <Carregando />;
  if (erro) return <Vazio titulo="Processo não encontrado" acao={<Link to="/portal" className="btn-claro">Voltar</Link>} />;
  const enviar = async (e) => {
    e.preventDefault();
    const f = arq.current?.files?.[0];
    if (!f) { avisar('Escolha um arquivo.', 'erro'); return; }
    const fd = new FormData(); fd.append('arquivo', f);
    setEnviando(true);
    try { await api.post(`/api/portal/processos/${p.id}/documentos`, fd); avisar('Documento enviado ao escritório.'); arq.current.value = ''; recarregar(); }
    catch (err) { avisar(err.message, 'erro'); } finally { setEnviando(false); }
  };
  return (
    <>
      <Link to="/portal" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />Meus processos</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div><h1 className="font-display text-2xl font-semibold">{p.titulo}</h1><p className="font-mono text-sm text-slate-500">{p.numero_cnj || 'Sem número de processo'}</p></div>
        <Selo cor={corStatusProc[p.status]}>{p.status}</Selo>
      </div>
      <div className="cartao mb-6 grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm md:grid-cols-4">
        {[['Área', p.area], ['Fase atual', p.fase], ['Tribunal / vara', [p.tribunal, p.vara].filter(Boolean).join(' · ') || '—'], ['Advogado(a)', p.responsavel_nome || '—']].map(([k, v]) => <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-medium">{v}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="cartao p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Andamento do processo</h2>
          {!p.andamentos.length ? <p className="text-sm text-slate-500">Ainda não há atualizações publicadas.</p> : (
            <ol className="relative ml-2 border-l-2 border-slate-200 dark:border-marinho-700">
              {p.andamentos.map((a) => (
                <li key={a.id} className="mb-5 ml-5 last:mb-0">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-esmeralda-500 dark:border-marinho-900" />
                  <p className="text-xs font-semibold text-esmeralda-600">{data(a.data)}</p><p className="mt-0.5 whitespace-pre-line text-sm">{a.descricao}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="min-w-0 space-y-6">
          {p.eventos.length > 0 && (
            <section className="cartao p-5">
              <h2 className="mb-3 font-semibold">Próximas datas</h2>
              <ul className="space-y-2 text-sm">{p.eventos.map((e) => <li key={e.id}><p className="font-medium">{e.titulo}</p><p className="text-xs text-slate-500">{dataHora(e.inicio)}{e.local ? ` · ${e.local}` : ''}</p></li>)}</ul>
            </section>
          )}
          <section className="cartao">
            <h2 className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-marinho-800">Documentos</h2>
            {!p.documentos.length ? <p className="px-5 py-4 text-sm text-slate-500">Nenhum documento compartilhado.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
                {p.documentos.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <FileText size={16} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{d.nome}</span><span className="text-xs text-slate-500">{d.enviado_por_cliente ? 'Enviado por você' : 'Do escritório'} · {utcParaLocal(d.criado_em)}</span></span>
                    <a className="btn-icone p-1.5" href={`/api/portal/documentos/${d.id}/arquivo`} aria-label={`Baixar ${d.nome}`}><Download size={16} /></a>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={enviar} className="space-y-2 border-t border-slate-200 p-4 dark:border-marinho-800">
              <p className="text-sm font-medium">Enviar documento ao escritório</p>
              <input ref={arq} type="file" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marinho-700 file:px-3 file:py-2 file:text-sm file:text-white" aria-label="Arquivo" />
              <button className="btn-primario w-full" disabled={enviando}><Upload size={16} />{enviando ? 'Enviando…' : 'Enviar'}</button>
              <p className="text-xs text-slate-500">RG, comprovantes, contratos, fotos… até 25 MB.</p>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

export function PortalMensagens() {
  const avisar = useAviso();
  const [itens, setItens] = useState(null);
  const carregar = useCallback(() => api.get('/api/portal/mensagens').then((l) => { setItens(l); window.dispatchEvent(new Event('jn-portal-lidas')); }).catch(() => {}), []);
  useEffect(() => { carregar(); }, [carregar]);
  useRepetir(carregar, 8000, []);
  const enviar = async (texto) => { try { await api.post('/api/portal/mensagens', { texto }); await carregar(); } catch (e) { avisar(e.message, 'erro'); throw e; } };
  return (
    <div className="cartao overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-marinho-800"><h2 className="font-semibold">Conversa com o escritório</h2><p className="text-xs text-slate-500">Respondemos em horário comercial.</p></div>
      <div className="bg-slate-50 dark:bg-marinho-950/40">
        {!itens ? <Carregando /> : <Conversa itens={itens} meu="cliente" onEnviar={enviar} vazio="Escreva sua dúvida. A equipe do escritório responde por aqui." altura="h-[58vh]" />}
      </div>
    </div>
  );
}

export function PortalPagamentos() {
  const { dados, carregando } = useCarregar(() => api.get('/api/portal/resumo'), []);
  if (carregando || !dados) return <Carregando />;
  const l = dados.parcelas;
  const soma = (f) => l.filter(f).reduce((s, x) => s + x.valor, 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="cartao p-4"><p className="text-xs text-slate-500">Pago</p><p className="mt-1 text-lg font-semibold text-esmeralda-600">{moeda(soma((x) => x.status === 'Pago'))}</p></div>
        <div className="cartao p-4"><p className="text-xs text-slate-500">A vencer</p><p className="mt-1 text-lg font-semibold">{moeda(soma((x) => x.status === 'Pendente'))}</p></div>
        <div className="cartao p-4"><p className="text-xs text-slate-500">Em atraso</p><p className={`mt-1 text-lg font-semibold ${soma((x) => x.status === 'Atrasado') ? 'text-red-600' : ''}`}>{moeda(soma((x) => x.status === 'Atrasado'))}</p></div>
      </div>
      <div className="cartao">
        {!l.length ? <Vazio titulo="Nenhum pagamento registrado" /> : (
          <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
            {l.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{x.descricao}{x.total_parcelas ? ` (${x.parcela}/${x.total_parcelas})` : ''}</p><p className="text-xs text-slate-500">Vencimento {data(x.vencimento)}{x.pago_em ? ` · pago em ${data(x.pago_em)}` : ''}</p></div>
                <div className="flex shrink-0 items-center gap-2"><span className="font-semibold">{moeda(x.valor)}</span><Selo cor={corStatusFin[x.status]}>{x.status}</Selo></div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Para segunda via ou dúvidas sobre pagamentos, fale com o escritório em Mensagens.</p>
    </>
  );
}
