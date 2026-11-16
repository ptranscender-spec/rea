import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Scale, KanbanSquare, AlarmClock, CalendarDays, Wallet, Settings,
  Search, Bell, Moon, Sun, LogOut, Menu, X, Briefcase, User, MessagesSquare,
} from 'lucide-react';
import { useSessao } from '../lib/sessao.jsx';
import { api } from '../lib/api.js';
import { data, PAPEIS } from '../lib/format.js';
import { useAtraso } from './ui.jsx';

export function Logo({ claro = false, className = '' }) {
  return (
    <span className={`flex items-center gap-2 font-display text-xl font-semibold ${claro ? 'text-white' : 'text-marinho-700 dark:text-white'} ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true"><rect width="32" height="32" rx="8" fill={claro ? '#ffffff14' : '#0F2A44'} /><path d="M16 7v18M10 25h12M9 11h14M9 11l-3.5 7a3.5 3.5 0 0 0 7 0zM23 11l-3.5 7a3.5 3.5 0 0 0 7 0z" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      JurisNexo
    </span>
  );
}

export function useTema() {
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains('dark'));
  const alternar = () => {
    const novo = !escuro;
    document.documentElement.classList.toggle('dark', novo);
    try { localStorage.setItem('jn-tema', novo ? 'escuro' : 'claro'); } catch { /* sem armazenamento */ }
    setEscuro(novo);
  };
  return [escuro, alternar];
}

function Busca() {
  const [termo, setTermo] = useState('');
  const [res, setRes] = useState(null);
  const [aberto, setAberto] = useState(false);
  const atrasado = useAtraso(termo, 250);
  const nav = useNavigate();
  const ref = useRef(null);
  useEffect(() => {
    if (atrasado.trim().length < 2) { setRes(null); return; }
    api.get('/api/busca', { q: atrasado }).then(setRes).catch(() => setRes(null));
  }, [atrasado]);
  useEffect(() => {
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const ir = (url) => { nav(url); setAberto(false); setTermo(''); };
  const vazio = res && !res.clientes.length && !res.processos.length;
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className="campo pl-9" placeholder="Buscar cliente, processo ou nº CNJ…" value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} aria-label="Busca global" />
      {aberto && res && (
        <div className="cartao absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto p-2 text-sm">
          {vazio && <p className="px-2 py-3 text-slate-500">Nada encontrado para “{atrasado}”.</p>}
          {res.processos.length > 0 && <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Processos</p>}
          {res.processos.map((p) => (
            <button key={'p' + p.id} onClick={() => ir(`/app/processos/${p.id}`)} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-marinho-800">
              <Briefcase size={16} className="mt-0.5 text-esmeralda-500" />
              <span><span className="block font-medium">{p.titulo}</span>{p.numero_cnj && <span className="text-xs text-slate-500">{p.numero_cnj}</span>}</span>
            </button>
          ))}
          {res.clientes.length > 0 && <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-slate-400">Clientes</p>}
          {res.clientes.map((c) => (
            <button key={'c' + c.id} onClick={() => ir(`/app/clientes/${c.id}`)} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-marinho-800">
              <User size={16} className="mt-0.5 text-sky-500" />
              <span><span className="block font-medium">{c.nome}</span>{c.documento && <span className="text-xs text-slate-500">{c.documento}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notificacoes() {
  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { api.get('/api/notificacoes').then(setItens).catch(() => {}); }, [loc.pathname]);
  useEffect(() => {
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);
  const atrasados = itens.filter((i) => i.situacao === 'atrasado').length;
  return (
    <div ref={ref} className="relative">
      <button className="btn-icone relative" onClick={() => setAberto(!aberto)} aria-label={`Notificações (${itens.length})`}>
        <Bell size={20} />
        {itens.length > 0 && <span className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${atrasados ? 'bg-red-600' : 'bg-esmeralda-500'}`}>{itens.length}</span>}
      </button>
      {aberto && (
        <div className="cartao absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] p-2">
          <p className="px-2 py-1.5 text-sm font-semibold">Seus prazos</p>
          {!itens.length && <p className="px-2 py-4 text-sm text-slate-500">Nenhum prazo vencendo nos próximos 2 dias. 🎉</p>}
          {itens.map((i) => (
            <button key={i.id} onClick={() => { setAberto(false); nav('/app/prazos'); }} className="flex w-full flex-col rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-marinho-800">
              <span className="font-medium">{i.titulo}</span>
              <span className={`text-xs ${i.situacao === 'atrasado' ? 'text-red-600' : 'text-slate-500'}`}>
                {i.situacao === 'atrasado' ? 'Atrasado — venceu em ' : 'Vence em '}{data(i.vencimento)}{i.processo_titulo ? ` · ${i.processo_titulo}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { usuario, escritorio, sair, veFinanceiro } = useSessao();
  const [escuro, alternarTema] = useTema();
  const [menu, setMenu] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    const contar = () => document.visibilityState === 'visible' && api.get('/api/mensagens/nao-lidas').then((r) => setNaoLidas(r.n)).catch(() => {});
    contar();
    const t = setInterval(contar, 15000);
    window.addEventListener('jn-mensagens-lidas', contar);
    return () => { clearInterval(t); window.removeEventListener('jn-mensagens-lidas', contar); };
  }, [loc.pathname]);
  const itens = [
    { to: '/app', rotulo: 'Painel', icone: LayoutDashboard, fim: true },
    { to: '/app/clientes', rotulo: 'Clientes', icone: Users },
    { to: '/app/processos', rotulo: 'Processos', icone: Scale },
    { to: '/app/kanban', rotulo: 'Kanban', icone: KanbanSquare },
    { to: '/app/prazos', rotulo: 'Prazos e tarefas', icone: AlarmClock },
    { to: '/app/agenda', rotulo: 'Agenda', icone: CalendarDays },
    { to: '/app/mensagens', rotulo: 'Mensagens', icone: MessagesSquare, badge: naoLidas },
    veFinanceiro && { to: '/app/financeiro', rotulo: 'Financeiro', icone: Wallet },
    { to: '/app/configuracoes', rotulo: 'Configurações', icone: Settings },
  ].filter(Boolean);

  const lateral = (
    <nav className="flex h-full flex-col bg-marinho-700 text-marinho-100 dark:bg-marinho-900">
      <div className="flex items-center justify-between px-5 py-5"><Logo claro /><button className="rounded p-1 hover:bg-white/10 lg:hidden" onClick={() => setMenu(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      <p className="truncate px-5 pb-4 text-xs text-marinho-200">{escritorio?.nome}</p>
      <ul className="flex-1 space-y-0.5 px-3">
        {itens.map(({ to, rotulo, icone: I, fim, badge }) => (
          <li key={to}>
            <NavLink to={to} end={fim} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-marinho-100 hover:bg-white/5 hover:text-white'}`}>
              {({ isActive }) => <><I size={18} className={isActive ? 'text-esmeralda-400' : ''} />{rotulo}{badge > 0 && <span className="ml-auto rounded-full bg-esmeralda-500 px-1.5 text-[11px] font-bold text-white">{badge}</span>}</>}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium text-white">{usuario?.nome}</p>
        <p className="text-xs text-marinho-200">{PAPEIS[usuario?.papel]}</p>
        <button onClick={sair} className="mt-3 flex items-center gap-2 text-sm text-marinho-200 hover:text-white"><LogOut size={16} />Sair</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{lateral}</aside>
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-marinho-950/60" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{lateral}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-marinho-800 dark:bg-marinho-950/90 sm:px-6">
        <button className="btn-icone lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu size={20} /></button>
        <Busca />
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-icone" onClick={alternarTema} aria-label={escuro ? 'Usar modo claro' : 'Usar modo escuro'}>{escuro ? <Sun size={20} /> : <Moon size={20} />}</button>
          <Notificacoes />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8"><Outlet /></main>
    </div>
  );
}
