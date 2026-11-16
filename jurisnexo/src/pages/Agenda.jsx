import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, Trash2, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { TIPOS_EVENTO, hojeIso, isoDe, dataDe, mesNome, hora, dataLonga } from '../lib/format.js';
import { Cabecalho, Campo, Carregando, Confirmar, Modal, Selecao, useAviso, useCarregar } from '../components/ui.jsx';
import { useProcessosSimples } from './Prazos.jsx';
import { useClientesSimples } from './Processos.jsx';

const COR = {
  Audiência: 'bg-violet-500', Reunião: 'bg-sky-500', Compromisso: 'bg-marinho-400', 'Prazo processual': 'bg-orange-500',
  prazo: 'bg-red-500', feriado: 'bg-slate-400',
};
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const VAZIO = { titulo: '', tipo: 'Reunião', data: '', inicio: '09:00', fim: '10:00', local: '', processo_id: '', cliente_id: '', responsavel_id: '', descricao: '' };

function FormEvento({ aberto, evento, dataInicial, onFechar, onSalvo }) {
  const { equipeAtiva, usuario } = useSessao();
  const avisar = useAviso();
  const processos = useProcessosSimples();
  const clientes = useClientesSimples(aberto);
  const [f, setF] = useState(VAZIO);
  const [excluir, setExcluir] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    if (evento) setF({ ...VAZIO, ...evento, data: evento.inicio.slice(0, 10), inicio: hora(evento.inicio), fim: hora(evento.fim || ''), processo_id: evento.processo_id ? String(evento.processo_id) : '', cliente_id: evento.cliente_id ? String(evento.cliente_id) : '', responsavel_id: evento.responsavel_id ? String(evento.responsavel_id) : '', local: evento.local || '', descricao: evento.descricao || '' });
    else setF({ ...VAZIO, data: dataInicial || hojeIso(), responsavel_id: String(usuario.id) });
  }, [aberto, evento, dataInicial, usuario]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    if (!f.titulo.trim() || !f.data) { avisar('Informe título e data.', 'erro'); return; }
    const corpo = { ...f, inicio: f.inicio ? `${f.data}T${f.inicio}` : f.data, fim: f.fim ? `${f.data}T${f.fim}` : null };
    try {
      if (evento) await api.put(`/api/eventos/${evento.id}`, corpo); else await api.post('/api/eventos', corpo);
      avisar(evento ? 'Compromisso atualizado.' : 'Compromisso criado.');
      onSalvo();
    } catch (e) { avisar(e.message, 'erro'); }
  };
  return (
    <>
      <Modal aberto={aberto} onFechar={onFechar} titulo={evento ? 'Editar compromisso' : 'Novo compromisso'} largura="max-w-2xl"
        rodape={<>
          {evento && <button className="btn-claro mr-auto text-red-600" onClick={() => setExcluir(true)}><Trash2 size={16} />Excluir</button>}
          <button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" onClick={salvar}>Salvar</button>
        </>}>
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Título *" className="sm:col-span-4"><input className="campo" value={f.titulo} onChange={set('titulo')} /></Campo>
          <Campo rotulo="Tipo" className="sm:col-span-2"><Selecao opcoes={TIPOS_EVENTO} value={f.tipo} onChange={set('tipo')} /></Campo>
          <Campo rotulo="Data *" className="sm:col-span-2"><input type="date" className="campo" value={f.data} onChange={set('data')} /></Campo>
          <Campo rotulo="Início" className="sm:col-span-2"><input type="time" className="campo" value={f.inicio} onChange={set('inicio')} /></Campo>
          <Campo rotulo="Fim" className="sm:col-span-2"><input type="time" className="campo" value={f.fim} onChange={set('fim')} /></Campo>
          <Campo rotulo="Local" className="sm:col-span-3"><input className="campo" value={f.local} onChange={set('local')} placeholder="Fórum, sala, link da videochamada…" /></Campo>
          <Campo rotulo="Responsável" className="sm:col-span-3"><Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Ninguém" value={f.responsavel_id} onChange={set('responsavel_id')} /></Campo>
          <Campo rotulo="Processo" className="sm:col-span-3"><Selecao opcoes={processos} vazio="Nenhum" value={f.processo_id} onChange={set('processo_id')} /></Campo>
          <Campo rotulo="Cliente" className="sm:col-span-3"><Selecao opcoes={clientes} vazio="Nenhum" value={f.cliente_id} onChange={set('cliente_id')} /></Campo>
          <Campo rotulo="Observações" className="sm:col-span-6"><textarea rows={2} className="campo" value={f.descricao} onChange={set('descricao')} /></Campo>
        </div>
      </Modal>
      <Confirmar aberto={excluir} onFechar={() => setExcluir(false)} titulo="Excluir compromisso" texto={`Excluir "${evento?.titulo}"?`}
        onConfirmar={async () => { await api.del(`/api/eventos/${evento.id}`); setExcluir(false); avisar('Compromisso excluído.'); onSalvo(); }} />
    </>
  );
}

function Item({ it, onAbrir, compacto }) {
  const cor = it.feriado ? COR.feriado : it.prazo ? COR.prazo : COR[it.tipo] || COR.Compromisso;
  const conteudo = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} />
      {!compacto && it.hora && <span className="shrink-0 font-semibold">{it.hora}</span>}
      <span className="truncate">{it.titulo}</span>
    </span>
  );
  const cls = `block w-full rounded px-1.5 py-0.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-marinho-800 ${it.concluido ? 'line-through opacity-50' : ''}`;
  if (it.feriado) return <div className={`${cls} italic text-slate-500`}>{conteudo}</div>;
  if (it.prazo) return <Link to={it.processo_id ? `/app/processos/${it.processo_id}` : '/app/prazos'} className={cls} title={`Prazo: ${it.titulo}`}>{conteudo}</Link>;
  return <button className={cls} onClick={(e) => { e.stopPropagation(); onAbrir(it.ref); }} title={it.titulo}>{conteudo}</button>;
}

export default function Agenda() {
  const { equipeAtiva } = useSessao();
  const [visao, setVisao] = useState(() => (window.innerWidth < 640 ? 'dia' : 'mes'));
  const [ref, setRef] = useState(() => dataDe(hojeIso()));
  const [resp, setResp] = useState('');
  const [form, setForm] = useState(null);
  const hoje = hojeIso();

  const [de, ate] = useMemo(() => {
    if (visao === 'dia') return [ref, ref];
    if (visao === 'semana') { const ini = somaDias(ref, -ref.getDay()); return [ini, somaDias(ini, 6)]; }
    const p = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const ini = somaDias(p, -p.getDay());
    return [ini, somaDias(ini, 41)];
  }, [visao, ref]);
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/agenda', { de: isoDe(de), ate: isoDe(ate), responsavel_id: resp }), [isoDe(de), isoDe(ate), resp]);

  const porDia = useMemo(() => {
    const m = {};
    const add = (d, it) => (m[d] ||= []).push(it);
    if (!dados) return m;
    dados.feriados.forEach((f) => add(f.data, { feriado: true, titulo: f.nome }));
    dados.prazos.forEach((p) => add(p.vencimento.slice(0, 10), { prazo: true, titulo: p.titulo, hora: hora(p.vencimento), processo_id: p.processo_id, concluido: p.status === 'Concluído' }));
    dados.eventos.forEach((e) => add(e.inicio.slice(0, 10), { titulo: e.titulo, tipo: e.tipo, hora: hora(e.inicio), ref: e }));
    Object.values(m).forEach((l) => l.sort((a, b) => (b.feriado - a.feriado) || (a.hora || '').localeCompare(b.hora || '')));
    return m;
  }, [dados]);

  const andar = (n) => setRef((r) => (visao === 'mes' ? new Date(r.getFullYear(), r.getMonth() + n, 1) : somaDias(r, visao === 'semana' ? 7 * n : n)));
  const titulo = visao === 'mes' ? mesNome(ref.getFullYear(), ref.getMonth())
    : visao === 'semana' ? `${de.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${ate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : dataLonga(isoDe(ref));
  const abrirEvento = (ev) => setForm({ evento: ev });

  return (
    <>
      <Cabecalho titulo="Agenda" subtitulo="Audiências, reuniões, compromissos e vencimentos de prazos.">
        <button className="btn-primario" onClick={() => setForm({ data: visao === 'mes' ? hoje : isoDe(ref) })}><Plus size={16} />Novo compromisso</button>
      </Cabecalho>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button className="btn-claro px-2" onClick={() => andar(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
          <button className="btn-claro" onClick={() => setRef(dataDe(hoje))}>Hoje</button>
          <button className="btn-claro px-2" onClick={() => andar(1)} aria-label="Próximo"><ChevronRight size={16} /></button>
        </div>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="inline-flex rounded-lg bg-slate-200/70 p-1 dark:bg-marinho-800">
            {[['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']].map(([v, r]) => <button key={v} onClick={() => setVisao(v)} className={`rounded-md px-3 py-1 text-sm font-medium ${visao === v ? 'bg-white shadow dark:bg-marinho-600' : 'text-slate-500'}`}>{r}</button>)}
          </div>
          <div className="min-w-44 flex-1"><Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Toda a equipe" value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Advogado" /></div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
        {[['Audiência', COR.Audiência], ['Reunião', COR.Reunião], ['Compromisso', COR.Compromisso], ['Prazo', COR.prazo], ['Feriado', COR.feriado]].map(([r, c]) => <span key={r} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{r}</span>)}
      </div>
      {carregando && !dados ? <Carregando /> : visao === 'mes' ? (
        <div className="cartao overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold uppercase text-slate-500 dark:border-marinho-800">{SEMANA.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const d = somaDias(de, i), k = isoDe(d), itens = porDia[k] || [];
              const fora = d.getMonth() !== ref.getMonth();
              return (
                <div key={k} onClick={() => setForm({ data: k })} className={`group min-h-24 cursor-pointer border-b border-r border-slate-100 p-1 transition hover:bg-esmeralda-50/50 dark:border-marinho-800 dark:hover:bg-marinho-800/40 sm:min-h-28 ${fora ? 'bg-slate-50/70 dark:bg-marinho-950/40' : ''}`}>
                  <div className="flex items-center justify-between px-1">
                    <button onClick={(e) => { e.stopPropagation(); setRef(d); setVisao('dia'); }} className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${k === hoje ? 'bg-esmeralda-500 font-bold text-white' : fora ? 'text-slate-400' : 'font-medium'}`}>{d.getDate()}</button>
                    <Plus size={12} className="text-slate-400 opacity-0 group-hover:opacity-100" />
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {itens.slice(0, 3).map((it, j) => <Item key={j} it={it} onAbrir={abrirEvento} compacto />)}
                    {itens.length > 3 && <button onClick={(e) => { e.stopPropagation(); setRef(d); setVisao('dia'); }} className="px-1.5 text-xs font-medium text-esmeralda-600">+{itens.length - 3} mais</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${visao === 'semana' ? 'md:grid-cols-7' : ''}`}>
          {Array.from({ length: visao === 'semana' ? 7 : 1 }, (_, i) => {
            const d = somaDias(de, i), k = isoDe(d), itens = porDia[k] || [];
            return (
              <div key={k} className={`cartao flex min-h-40 flex-col ${k === hoje ? 'ring-2 ring-esmeralda-500' : ''}`}>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-marinho-800">
                  <span className="text-sm font-semibold capitalize">{d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })}</span>
                  <button className="btn-icone p-1" onClick={() => setForm({ data: k })} aria-label="Novo compromisso neste dia"><Plus size={14} /></button>
                </div>
                <div className="flex-1 space-y-1 p-2">
                  {!itens.length && <p className="py-4 text-center text-xs text-slate-400">Livre</p>}
                  {itens.map((it, j) => visao === 'dia' && it.ref ? (
                    <button key={j} onClick={() => abrirEvento(it.ref)} className="flex w-full gap-3 rounded-lg border border-slate-100 p-3 text-left hover:border-esmeralda-500/50 dark:border-marinho-800">
                      <span className={`w-1 shrink-0 rounded ${COR[it.tipo] || COR.Compromisso}`} />
                      <span className="min-w-0"><span className="block text-sm font-semibold">{it.hora}{it.ref.fim ? `–${hora(it.ref.fim)}` : ''} · {it.titulo}</span>
                        <span className="block text-xs text-slate-500">{it.tipo}{it.ref.responsavel_nome ? ` · ${it.ref.responsavel_nome}` : ''}{it.ref.processo_titulo ? ` · ${it.ref.processo_titulo}` : ''}</span>
                        {it.ref.local && <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{it.ref.local}</span>}</span>
                    </button>
                  ) : <Item key={j} it={it} onAbrir={abrirEvento} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <FormEvento aberto={!!form} evento={form?.evento} dataInicial={form?.data} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); recarregar(); }} />
    </>
  );
}
