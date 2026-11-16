import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Scale, CalendarClock, KanbanSquare, Wallet, Users, ShieldCheck, Moon, Sun } from 'lucide-react';
import { Logo, useTema } from '../components/Layout.jsx';
import { useSessao } from '../lib/sessao.jsx';
import { api } from '../lib/api.js';
import { Campo } from '../components/ui.jsx';

const RECURSOS = [
  { i: Scale, t: 'Processos no padrão CNJ', d: 'Andamentos, documentos, anotações e financeiro de cada caso, com o número conferido automaticamente.' },
  { i: CalendarClock, t: 'Prazos em dias úteis', d: 'Calculadora que pula fins de semana e feriados, com alertas de prazos do dia e atrasados.' },
  { i: KanbanSquare, t: 'Kanban jurídico', d: 'Arraste os casos entre etapas e veja o próximo prazo de cada um.' },
  { i: Wallet, t: 'Financeiro do escritório', d: 'Honorários parcelados, custas e despesas, com relatório em planilha.' },
  { i: Users, t: 'Equipe com papéis', d: 'Administrador, advogado e estagiário, cada um vendo só o que precisa.' },
  { i: ShieldCheck, t: 'Dados separados por escritório', d: 'Cada escritório enxerga apenas os próprios clientes e processos.' },
];

export function Inicio() {
  const { usuario } = useSessao();
  const [escuro, alternar] = useTema();
  if (usuario) return <Navigate to="/app" replace />;
  return (
    <div className="min-h-screen bg-white dark:bg-marinho-950">
      <section className="bg-gradient-to-br from-marinho-800 via-marinho-700 to-[#0d4a4a] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo claro />
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-2 text-marinho-100 hover:bg-white/10" onClick={alternar} aria-label="Alternar tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
            <Link to="/entrar" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10">Entrar</Link>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
          <div>
            <span className="inline-block rounded-full border border-esmeralda-400/40 px-3 py-1 text-xs font-medium uppercase tracking-wider text-esmeralda-400">Feito para a advocacia brasileira</span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">Seu escritório em ordem. Seus prazos sob controle.</h1>
            <p className="mt-5 max-w-lg text-lg text-marinho-100">Clientes, processos, prazos, agenda e financeiro em um só lugar — simples para o dia a dia e seguro para os dados dos seus clientes.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro" className="btn-primario px-5 py-3 text-base">Criar conta do escritório</Link>
              <Link to="/entrar" className="btn px-5 py-3 text-base text-white ring-1 ring-white/30 hover:bg-white/10">Entrar</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur">
            <div className="rounded-xl bg-white p-4 text-slate-800 shadow-2xl">
              <p className="text-xs font-semibold uppercase text-slate-400">Hoje</p>
              {[['Réplica à contestação', 'Vence hoje', 'bg-orange-100 text-orange-700'], ['Audiência de instrução', 'Em 3 dias', 'bg-sky-100 text-sky-700'], ['Recurso ordinário', 'Fatal', 'bg-red-100 text-red-700']].map(([t, s, c]) => (
                <div key={t} className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                  <span className="text-sm font-medium">{t}</span><span className={`selo ${c}`}>{s}</span>
                </div>
              ))}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[['12', 'Processos'], ['3', 'Prazos'], ['R$ 9,6 mil', 'A receber']].map(([n, r]) => (
                  <div key={r} className="rounded-lg bg-slate-50 p-2"><p className="font-semibold text-marinho-700">{n}</p><p className="text-[11px] text-slate-500">{r}</p></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-3xl font-semibold">Tudo o que o dia a dia jurídico pede</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map(({ i: I, t, d }) => (
            <div key={t} className="cartao p-6">
              <I className="text-esmeralda-500" size={24} />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-marinho-800">JurisNexo · gestão para escritórios de advocacia</footer>
    </div>
  );
}

export function Acesso({ modo }) {
  const { usuario, atualizar } = useSessao();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ nome: '', email: params.get('email') || '', senha: '', escritorio: '', oab: '', convite: false });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (usuario) return <Navigate to="/app" replace />;
  const cadastro = modo === 'cadastro';
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const enviar = async (e) => {
    e.preventDefault();
    setErro(''); setOcupado(true);
    try {
      if (cadastro) await api.post('/api/auth/cadastro', { ...f, escritorio: f.convite ? '' : f.escritorio });
      else await api.post('/api/auth/login', { email: f.email, senha: f.senha });
      await atualizar();
      nav('/app');
    } catch (err) { setErro(err.message); } finally { setOcupado(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marinho-800 via-marinho-700 to-[#0d4a4a] px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex justify-center"><Logo claro /></Link>
        <form onSubmit={enviar} className="cartao space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-semibold">{cadastro ? 'Criar conta' : 'Entrar'}</h1>
            <p className="mt-1 text-sm text-slate-500">{cadastro ? 'Cadastre seu escritório e comece a organizar seus casos.' : 'Bem-vindo de volta.'}</p>
          </div>
          {cadastro && <Campo rotulo="Seu nome"><input className="campo" required value={f.nome} onChange={mudar('nome')} autoComplete="name" /></Campo>}
          <Campo rotulo="E-mail"><input className="campo" type="email" required value={f.email} onChange={mudar('email')} autoComplete="email" /></Campo>
          <Campo rotulo="Senha" dica={cadastro ? 'Mínimo de 8 caracteres.' : undefined}><input className="campo" type="password" required minLength={cadastro ? 8 : undefined} value={f.senha} onChange={mudar('senha')} autoComplete={cadastro ? 'new-password' : 'current-password'} /></Campo>
          {cadastro && (
            <>
              <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="mt-0.5 accent-esmeralda-500" checked={f.convite} onChange={mudar('convite')} />
                Fui convidado por um escritório que já usa o JurisNexo
              </label>
              {!f.convite && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo rotulo="Nome do escritório" className="sm:col-span-2"><input className="campo" required value={f.escritorio} onChange={mudar('escritorio')} /></Campo>
                  <Campo rotulo="OAB/UF (opcional)"><input className="campo" value={f.oab} onChange={mudar('oab')} placeholder="123456/SP" /></Campo>
                </div>
              )}
            </>
          )}
          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
          <button className="btn-primario w-full py-2.5" disabled={ocupado}>{ocupado ? 'Aguarde…' : cadastro ? 'Criar conta' : 'Entrar'}</button>
          <p className="text-center text-sm text-slate-500">
            {cadastro ? <>Já tem conta? <Link className="font-medium text-esmeralda-600" to="/entrar">Entrar</Link></> : <>Ainda não tem conta? <Link className="font-medium text-esmeralda-600" to="/cadastro">Criar conta do escritório</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}
