import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, User, GripVertical, Settings2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { AREAS, data, situacaoPrazo } from '../lib/format.js';
import { Cabecalho, Carregando, Selecao, Selo, useAviso, useCarregar } from '../components/ui.jsx';

export default function Kanban() {
  const { equipeAtiva, ehAdmin } = useSessao();
  const avisar = useAviso();
  const [filtros, setFiltros] = useState({ responsavel_id: '', area: '', etiqueta: '' });
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/kanban', filtros), [JSON.stringify(filtros)]);
  const { dados: etiquetas } = useCarregar(() => api.get('/api/config/etiquetas'), []);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [local, setLocal] = useState({});

  const mover = async (cartaoId, colunaId) => {
    const cartao = dados.cartoes.find((c) => c.id === cartaoId);
    if (!cartao || (local[cartaoId] ?? cartao.coluna_id) === colunaId) return;
    setLocal((l) => ({ ...l, [cartaoId]: colunaId }));
    try { await api.patch(`/api/processos/${cartaoId}/coluna`, { coluna_id: colunaId }); }
    catch (e) { avisar(e.message, 'erro'); setLocal((l) => { const n = { ...l }; delete n[cartaoId]; return n; }); recarregar(); }
  };
  const setF = (k) => (e) => setFiltros({ ...filtros, [k]: e.target.value });

  return (
    <>
      <Cabecalho titulo="Kanban jurídico" subtitulo="Arraste os cartões para mudar a etapa de cada processo. No celular, use o seletor do cartão.">
        {ehAdmin && <Link className="btn-claro" to="/app/configuracoes?aba=kanban"><Settings2 size={16} />Colunas</Link>}
      </Cabecalho>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Todos os responsáveis" value={filtros.responsavel_id} onChange={setF('responsavel_id')} aria-label="Responsável" />
        <Selecao opcoes={AREAS} vazio="Todas as áreas" value={filtros.area} onChange={setF('area')} aria-label="Área" />
        <Selecao opcoes={etiquetas || []} vazio="Todas as etiquetas" value={filtros.etiqueta} onChange={setF('etiqueta')} aria-label="Etiqueta" />
      </div>
      {carregando && !dados ? <Carregando /> : (
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {dados.colunas.map((col) => {
            const cartoes = dados.cartoes.filter((c) => (local[c.id] ?? c.coluna_id) === col.id);
            return (
              <section key={col.id}
                onDragOver={(e) => { e.preventDefault(); setSobre(col.id); }}
                onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
                onDrop={(e) => { e.preventDefault(); setSobre(null); mover(Number(e.dataTransfer.getData('text/plain')), col.id); }}
                className={`flex w-72 shrink-0 snap-start flex-col rounded-2xl border-2 p-2 transition ${sobre === col.id ? 'border-esmeralda-500 bg-esmeralda-50 dark:bg-esmeralda-500/10' : 'border-transparent bg-slate-100 dark:bg-marinho-900'}`}>
                <header className="flex items-center justify-between px-2 py-2">
                  <h2 className="text-sm font-semibold">{col.nome}</h2>
                  <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500 dark:bg-marinho-800">{cartoes.length}</span>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2">
                  {cartoes.map((c) => {
                    const prazo = c.proximo_prazo ? situacaoPrazo({ status: 'Pendente', vencimento: c.proximo_prazo }) : null;
                    return (
                      <article key={c.id} draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move'; setArrastando(c.id); }}
                        onDragEnd={() => setArrastando(null)}
                        className={`cartao cursor-grab p-3 text-sm active:cursor-grabbing ${arrastando === c.id ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-1">
                          <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-300" />
                          <Link to={`/app/processos/${c.id}`} className="font-medium leading-snug hover:text-esmeralda-600">{c.titulo}</Link>
                        </div>
                        {c.numero_cnj && <p className="ml-5 mt-0.5 font-mono text-[11px] text-slate-400">{c.numero_cnj}</p>}
                        <div className="ml-5 mt-2 space-y-1 text-xs text-slate-500">
                          {c.cliente_nome && <p className="truncate">👤 {c.cliente_nome}</p>}
                          {c.responsavel_nome && <p className="flex items-center gap-1 truncate"><User size={12} />{c.responsavel_nome}</p>}
                        </div>
                        <div className="ml-5 mt-2 flex flex-wrap gap-1">
                          <Selo cor="cinza">{c.area}</Selo>
                          {c.etiquetas && c.etiquetas.split(',').map((t) => <Selo key={t} cor="marinho">{t}</Selo>)}
                          {prazo && <Selo cor={prazo.cor}><CalendarClock size={11} />{data(c.proximo_prazo)}</Selo>}
                        </div>
                        <select className="campo ml-5 mt-2 w-[calc(100%-1.25rem)] py-1 text-xs sm:hidden" value={local[c.id] ?? c.coluna_id} onChange={(e) => mover(c.id, Number(e.target.value))} aria-label="Mover para">
                          {dados.colunas.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
                        </select>
                      </article>
                    );
                  })}
                  {!cartoes.length && <p className="px-2 py-6 text-center text-xs text-slate-400">Solte um cartão aqui</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
