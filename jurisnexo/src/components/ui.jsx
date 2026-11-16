import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Inbox, CheckCircle2, AlertTriangle } from 'lucide-react';

// ---------- Avisos (toast) ----------
const AvisoCtx = createContext(() => {});
export const useAviso = () => useContext(AvisoCtx);
export function AvisoProvider({ children }) {
  const [itens, setItens] = useState([]);
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setItens((l) => [...l.slice(-2), { id, texto, tipo }]);
    setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {itens.map((i) => (
          <div key={i.id} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${i.tipo === 'erro' ? 'bg-red-600' : 'bg-marinho-700'}`}>
            {i.tipo === 'erro' ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-esmeralda-400" />}
            <span>{i.texto}</span>
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

// ---------- Modal ----------
export function Modal({ aberto, titulo, onFechar, children, largura = 'max-w-lg', rodape }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    const foco = ref.current?.querySelector('input, select, textarea');
    foco?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-marinho-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} className={`cartao flex max-h-[92vh] w-full ${largura} flex-col rounded-b-none sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-marinho-800">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="btn-icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-marinho-800">{rodape}</div>}
      </div>
    </div>
  );
}

export function Confirmar({ aberto, titulo = 'Confirmar', texto, onConfirmar, onFechar, rotulo = 'Excluir' }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onFechar} largura="max-w-md"
      rodape={<>
        <button className="btn-claro" onClick={onFechar}>Cancelar</button>
        <button className="btn-perigo" disabled={ocupado} onClick={async () => { setOcupado(true); try { await onConfirmar(); } finally { setOcupado(false); } }}>{rotulo}</button>
      </>}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{texto}</p>
    </Modal>
  );
}

// ---------- Formulário ----------
export function Campo({ rotulo, erro, children, className = '', dica }) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="rotulo">{rotulo}</span>}
      {children}
      {dica && !erro && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
      {erro && <span className="mt-1 block text-xs text-red-600">{erro}</span>}
    </label>
  );
}
export function Selecao({ opcoes, vazio, ...p }) {
  return (
    <select className="campo" {...p}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.valor} value={o.valor}>{o.rotulo}</option>))}
    </select>
  );
}

// ---------- Exibição ----------
const CORES = {
  verde: 'bg-esmeralda-100 text-esmeralda-700 dark:bg-esmeralda-500/15 dark:text-esmeralda-400',
  vermelho: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  laranja: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  amarelo: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  azul: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  roxo: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  cinza: 'bg-slate-100 text-slate-600 dark:bg-marinho-800 dark:text-slate-300',
  marinho: 'bg-marinho-100 text-marinho-700 dark:bg-marinho-700 dark:text-marinho-100',
};
export const Selo = ({ cor = 'cinza', children, className = '' }) => <span className={`selo ${CORES[cor]} ${className}`}>{children}</span>;
export const corPrioridade = { Baixa: 'cinza', Média: 'azul', Alta: 'laranja', Fatal: 'vermelho' };
export const corStatusFin = { Pago: 'verde', Pendente: 'amarelo', Atrasado: 'vermelho' };
export const corStatusProc = { Ativo: 'verde', Suspenso: 'amarelo', Encerrado: 'cinza' };

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />{texto}</div>;
}
export function Vazio({ titulo, texto, acao, icone: Icone = Inbox }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-marinho-800"><Icone size={24} /></div>
      <p className="font-medium text-slate-700 dark:text-slate-200">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-slate-500">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
export function Cabecalho({ titulo, subtitulo, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
export function Paginacao({ pagina, paginas, total, onMudar }) {
  if (paginas <= 1) return <p className="px-4 py-3 text-xs text-slate-500">{total} registro{total === 1 ? '' : 's'}</p>;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-xs text-slate-500">{total} registros · página {pagina} de {paginas}</span>
      <div className="flex gap-1">
        <button className="btn-claro px-2 py-1" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
        <button className="btn-claro px-2 py-1" disabled={pagina >= paginas} onClick={() => onMudar(pagina + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
export function Abas({ abas, ativa, onMudar }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-marinho-800">
      {abas.map((a) => (
        <button key={a.id} onClick={() => onMudar(a.id)}
          className={`aba ${ativa === a.id ? 'border-esmeralda-500 text-marinho-700 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          {a.rotulo}{a.qtd !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-marinho-800">{a.qtd}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Hooks ----------
export function useCarregar(fn, deps) {
  const [estado, setEstado] = useState({ dados: null, carregando: true, erro: null });
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    fn().then((dados) => vivo && setEstado({ dados, carregando: false, erro: null }))
      .catch((erro) => vivo && setEstado({ dados: null, carregando: false, erro }));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}
export function useAtraso(valor, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}
