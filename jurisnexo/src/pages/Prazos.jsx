import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Calculator, Check, Pencil, Trash2, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { TIPOS_PRAZO, PRIORIDADES, data, dataHora, hojeIso, situacaoPrazo, dataLonga } from '../lib/format.js';
import { Cabecalho, Campo, Carregando, Confirmar, Modal, Selecao, Selo, Vazio, corPrioridade, useAviso, useAtraso, useCarregar } from '../components/ui.jsx';

export function useProcessosSimples() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    api.get('/api/opcoes/processos')
      .then((itens) => setLista(itens.map((i) => ({ valor: String(i.id), rotulo: i.titulo + (i.numero_cnj ? ` (${i.numero_cnj})` : '') }))))
      .catch(() => {});
  }, []);
  return lista;
}

export function Calculadora({ onUsar }) {
  const [inicio, setInicio] = useState(hojeIso());
  const [dias, setDias] = useState(15);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState('');
  const calcular = async (e) => {
    e?.preventDefault();
    setErro('');
    try { setRes(await api.post('/api/prazos/calcular', { inicio, dias: Number(dias) })); } catch (err) { setErro(err.message); setRes(null); }
  };
  return (
    <form onSubmit={calcular} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Publicação / intimação"><input type="date" className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></Campo>
        <Campo rotulo="Prazo (dias úteis)"><input type="number" min="1" max="365" className="campo" value={dias} onChange={(e) => setDias(e.target.value)} required /></Campo>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[5, 8, 10, 15, 30].map((d) => <button type="button" key={d} onClick={() => setDias(d)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${Number(dias) === d ? 'bg-esmeralda-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-marinho-800 dark:text-slate-300'}`}>{d} dias</button>)}
      </div>
      <button className="btn-escuro w-full"><Calculator size={16} />Calcular</button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {res && (
        <div className="rounded-xl bg-esmeralda-50 p-4 dark:bg-esmeralda-500/10">
          <p className="text-xs font-medium uppercase text-esmeralda-700 dark:text-esmeralda-400">Prazo final</p>
          <p className="font-display text-2xl font-semibold text-marinho-700 dark:text-white">{data(res.vencimento)}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{dataLonga(res.vencimento)}</p>
          <p className="mt-2 text-xs text-slate-500">Contagem a partir do dia seguinte à publicação, só em dias úteis. Dias pulados: {res.pulados.length}.</p>
          {res.feriados.length > 0 && <ul className="mt-1 text-xs text-slate-500">{res.feriados.map((f) => <li key={f.data}>• {data(f.data)} — {f.nome}</li>)}</ul>}
          {onUsar && <button type="button" className="btn-primario mt-3 w-full" onClick={() => onUsar(res.vencimento)}>Usar esta data</button>}
        </div>
      )}
      <p className="text-xs text-slate-500">Confira sempre feriados locais e suspensões do tribunal em Configurações → Feriados.</p>
    </form>
  );
}

const VAZIO = { titulo: '', tipo: 'Prazo processual', processo_id: '', responsavel_id: '', vencimento: '', hora: '', prioridade: 'Média', status: 'Pendente', descricao: '' };

export function FormPrazo({ aberto, prazo, processoId, onFechar, onSalvo, onExcluir }) {
  const { equipeAtiva, usuario } = useSessao();
  const processos = useProcessosSimples();
  const avisar = useAviso();
  const [f, setF] = useState(VAZIO);
  const [calc, setCalc] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setCalc(false);
    if (prazo) setF({ ...VAZIO, ...prazo, processo_id: prazo.processo_id ? String(prazo.processo_id) : '', responsavel_id: prazo.responsavel_id ? String(prazo.responsavel_id) : '', vencimento: prazo.vencimento.slice(0, 10), hora: prazo.vencimento.slice(11, 16), descricao: prazo.descricao || '' });
    else setF({ ...VAZIO, processo_id: processoId ? String(processoId) : '', responsavel_id: String(usuario.id) });
  }, [aberto, prazo, processoId, usuario]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    if (!f.titulo.trim() || !f.vencimento) { avisar('Preencha título e vencimento.', 'erro'); return; }
    setOcupado(true);
    const corpo = { ...f, vencimento: f.hora ? `${f.vencimento}T${f.hora}` : f.vencimento };
    try {
      if (prazo) await api.put(`/api/prazos/${prazo.id}`, corpo); else await api.post('/api/prazos', corpo);
      avisar(prazo ? 'Prazo atualizado.' : 'Prazo criado.');
      onSalvo();
    } catch (e) { avisar(e.message, 'erro'); } finally { setOcupado(false); }
  };
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={prazo ? 'Editar prazo/tarefa' : 'Novo prazo/tarefa'} largura="max-w-2xl"
      rodape={<>
        {prazo && onExcluir && <button className="btn-claro mr-auto text-red-600" onClick={() => onExcluir(prazo)}><Trash2 size={16} />Excluir</button>}
        <button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" disabled={ocupado} onClick={salvar}>Salvar</button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Título *" className="sm:col-span-2"><input className="campo" value={f.titulo} onChange={set('titulo')} placeholder="Ex.: Contestação, Juntar procuração…" /></Campo>
        <Campo rotulo="Tipo"><Selecao opcoes={TIPOS_PRAZO} value={f.tipo} onChange={set('tipo')} /></Campo>
        <Campo rotulo="Prioridade"><Selecao opcoes={PRIORIDADES} value={f.prioridade} onChange={set('prioridade')} /></Campo>
        <Campo rotulo="Processo vinculado" className="sm:col-span-2"><Selecao opcoes={processos} vazio="Nenhum" value={f.processo_id} onChange={set('processo_id')} /></Campo>
        <Campo rotulo="Responsável"><Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Ninguém" value={f.responsavel_id} onChange={set('responsavel_id')} /></Campo>
        {prazo && <Campo rotulo="Status"><Selecao opcoes={['Pendente', 'Concluído', 'Cancelado']} value={f.status} onChange={set('status')} /></Campo>}
        <Campo rotulo="Vencimento *">
          <div className="flex gap-2"><input type="date" className="campo" value={f.vencimento} onChange={set('vencimento')} /><input type="time" className="campo w-32" value={f.hora} onChange={set('hora')} aria-label="Hora (opcional)" /></div>
        </Campo>
        <div className="flex items-end"><button type="button" className="btn-claro w-full" onClick={() => setCalc(!calc)}><Calculator size={16} />{calc ? 'Fechar calculadora' : 'Calcular em dias úteis'}</button></div>
        {calc && <div className="rounded-xl border border-slate-200 p-4 dark:border-marinho-700 sm:col-span-2"><Calculadora onUsar={(d) => { setF({ ...f, vencimento: d }); setCalc(false); }} /></div>}
        <Campo rotulo="Descrição" className="sm:col-span-2"><textarea rows={3} className="campo" value={f.descricao} onChange={set('descricao')} /></Campo>
      </div>
    </Modal>
  );
}

export function LinhaPrazo({ p, onEditar, onMudou, mostrarProcesso = true }) {
  const avisar = useAviso();
  const s = situacaoPrazo(p);
  const mudar = async (status) => {
    try { await api.patch(`/api/prazos/${p.id}/status`, { status }); avisar(status === 'Concluído' ? 'Prazo concluído.' : 'Prazo reaberto.'); onMudou(); } catch (e) { avisar(e.message, 'erro'); }
  };
  const feito = p.status !== 'Pendente';
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${s.cor === 'vermelho' ? 'bg-red-50/60 dark:bg-red-500/5' : ''}`}>
      <button onClick={() => mudar(feito ? 'Pendente' : 'Concluído')} aria-label={feito ? 'Reabrir' : 'Marcar como concluído'}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${feito ? 'border-esmeralda-500 bg-esmeralda-500 text-white' : 'border-slate-300 hover:border-esmeralda-500 dark:border-marinho-600'}`}>
        {feito && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${feito ? 'text-slate-400 line-through' : ''}`}>{p.titulo}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {p.tipo} · {dataHora(p.vencimento)}{p.responsavel_nome ? ` · ${p.responsavel_nome}` : ''}
          {mostrarProcesso && p.processo_titulo && <> · <Link className="hover:underline" to={`/app/processos/${p.processo_id}`}>{p.processo_titulo}</Link></>}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Selo cor={corPrioridade[p.prioridade]}>{p.prioridade}</Selo>
        <Selo cor={s.cor}>{s.rotulo}</Selo>
        {onEditar && <button className="btn-icone p-1" onClick={() => onEditar(p)} aria-label="Editar"><Pencil size={15} /></button>}
      </div>
    </li>
  );
}

export default function Prazos() {
  const [params] = useSearchParams();
  const { equipeAtiva } = useSessao();
  const avisar = useAviso();
  const [situacao, setSituacao] = useState(params.get('situacao') || 'Pendente');
  const [resp, setResp] = useState('');
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const termo = useAtraso(busca);
  const [form, setForm] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const filtro = ['atrasados', 'hoje'].includes(situacao) ? { situacao } : { status: situacao };
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/prazos', { ...filtro, responsavel_id: resp, tipo, q: termo }), [situacao, resp, tipo, termo]);
  return (
    <>
      <Cabecalho titulo="Prazos e tarefas" subtitulo="Prazos processuais, audiências e tarefas internas da equipe.">
        <button className="btn-primario" onClick={() => setForm({})}><Plus size={16} />Novo prazo</button>
      </Cabecalho>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="cartao">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-marinho-800 sm:flex-row sm:flex-wrap">
              <div className="relative min-w-[180px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="campo pl-9" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
              <div className="sm:w-40"><Selecao value={situacao} onChange={(e) => setSituacao(e.target.value)} opcoes={[{ valor: 'Pendente', rotulo: 'Pendentes' }, { valor: 'hoje', rotulo: 'Vencem hoje' }, { valor: 'atrasados', rotulo: 'Atrasados' }, { valor: 'Concluído', rotulo: 'Concluídos' }, { valor: 'Cancelado', rotulo: 'Cancelados' }]} /></div>
              <div className="sm:w-40"><Selecao value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={TIPOS_PRAZO} vazio="Todos os tipos" /></div>
              <div className="sm:w-44"><Selecao value={resp} onChange={(e) => setResp(e.target.value)} opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Toda a equipe" /></div>
            </div>
            {carregando && !dados ? <Carregando /> : !dados?.length ? <Vazio titulo="Nenhum prazo aqui" texto="Ajuste os filtros ou crie um novo prazo." /> : (
              <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
                {dados.map((p) => <LinhaPrazo key={p.id} p={p} onEditar={(x) => setForm({ prazo: x })} onMudou={recarregar} />)}
              </ul>
            )}
          </div>
        </div>
        <aside className="cartao h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Calculator size={18} className="text-esmeralda-500" />Calculadora de prazos</h2>
          <Calculadora />
        </aside>
      </div>
      <FormPrazo aberto={!!form} prazo={form?.prazo} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); recarregar(); }}
        onExcluir={(p) => { setForm(null); setExcluir(p); }} />
      <Confirmar aberto={!!excluir} onFechar={() => setExcluir(null)} titulo="Excluir prazo" texto={`Excluir "${excluir?.titulo}"?`}
        onConfirmar={async () => { await api.del(`/api/prazos/${excluir.id}`); avisar('Prazo excluído.'); setExcluir(null); recarregar(); }} />
    </>
  );
}

