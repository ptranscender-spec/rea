import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ArrowLeft, Upload, Download, FileText, Save, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { AREAS, FASES, STATUS_PROC, CATS_DOC, mascaraCNJ, moeda, data, utcParaLocal, hojeIso } from '../lib/format.js';
import {
  Abas, Cabecalho, Campo, Carregando, Confirmar, Modal, Paginacao, Selecao, Selo, Vazio,
  corStatusProc, corStatusFin, useAviso, useAtraso, useCarregar,
} from '../components/ui.jsx';
import { FormPrazo, LinhaPrazo } from './Prazos.jsx';
import { FormLancamento } from './Financeiro.jsx';

const VAZIO = { titulo: '', numero_cnj: '', cliente_id: '', parte_contraria: '', area: 'Cível', tribunal: '', vara: '', comarca: '', fase: 'Inicial', valor_causa: '', responsavel_id: '', etiquetas: '', status: 'Ativo' };

export function useClientesSimples(aberto = true) {
  const [lista, setLista] = useState([]);
  useEffect(() => { if (aberto) api.get('/api/opcoes/clientes').then((l) => setLista(l.map((c) => ({ valor: String(c.id), rotulo: c.nome })))).catch(() => {}); }, [aberto]);
  return lista;
}

function cnjOk(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return true;
  if (d.length !== 20) return false;
  const base = BigInt(d.slice(0, 7) + d.slice(9) + '00');
  return Number(98n - (base % 97n)) === Number(d.slice(7, 9));
}

export function FormProcesso({ aberto, processo, clienteInicial, onFechar, onSalvo }) {
  const { equipeAtiva, usuario } = useSessao();
  const clientes = useClientesSimples(aberto);
  const avisar = useAviso();
  const [f, setF] = useState(VAZIO);
  const [erroCnj, setErroCnj] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setErroCnj('');
    if (processo) setF({ ...VAZIO, ...Object.fromEntries(Object.entries(processo).filter(([k]) => k in VAZIO).map(([k, v]) => [k, v === null ? '' : String(v)])) });
    else setF({ ...VAZIO, cliente_id: clienteInicial ? String(clienteInicial) : '', responsavel_id: String(usuario.id) });
  }, [aberto, processo, clienteInicial, usuario]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    if (!f.titulo.trim()) { avisar('Informe o título.', 'erro'); return; }
    if (!cnjOk(f.numero_cnj)) { setErroCnj('Número CNJ inválido (confira o dígito verificador).'); return; }
    setOcupado(true);
    try {
      const corpo = { ...f, valor_causa: f.valor_causa === '' ? null : Number(String(f.valor_causa).replace(/\./g, '').replace(',', '.')) };
      const r = processo ? await api.put(`/api/processos/${processo.id}`, corpo) : await api.post('/api/processos', corpo);
      avisar(processo ? 'Processo atualizado.' : 'Processo cadastrado.');
      onSalvo(r.id);
    } catch (e) { avisar(e.message, 'erro'); } finally { setOcupado(false); }
  };
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={processo ? 'Editar processo' : 'Novo processo/caso'} largura="max-w-3xl"
      rodape={<><button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Campo rotulo="Título *" className="sm:col-span-6"><input className="campo" value={f.titulo} onChange={set('titulo')} placeholder="Ex.: Ação de cobrança contra…" /></Campo>
        <Campo rotulo="Número do processo (CNJ)" erro={erroCnj} dica="Deixe em branco para casos ainda não ajuizados." className="sm:col-span-3">
          <input className="campo font-mono" inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" value={f.numero_cnj} onChange={(e) => { setErroCnj(''); setF({ ...f, numero_cnj: mascaraCNJ(e.target.value) }); }} />
        </Campo>
        <Campo rotulo="Cliente" className="sm:col-span-3"><Selecao opcoes={clientes} vazio="Selecione…" value={f.cliente_id} onChange={set('cliente_id')} /></Campo>
        <Campo rotulo="Parte contrária" className="sm:col-span-3"><input className="campo" value={f.parte_contraria} onChange={set('parte_contraria')} /></Campo>
        <Campo rotulo="Área do direito" className="sm:col-span-3"><Selecao opcoes={AREAS} value={f.area} onChange={set('area')} /></Campo>
        <Campo rotulo="Tribunal" className="sm:col-span-2"><input className="campo" value={f.tribunal} onChange={set('tribunal')} placeholder="TJSP, TRT-2…" /></Campo>
        <Campo rotulo="Vara" className="sm:col-span-2"><input className="campo" value={f.vara} onChange={set('vara')} /></Campo>
        <Campo rotulo="Comarca" className="sm:col-span-2"><input className="campo" value={f.comarca} onChange={set('comarca')} /></Campo>
        <Campo rotulo="Fase" className="sm:col-span-2"><Selecao opcoes={FASES} value={f.fase} onChange={set('fase')} /></Campo>
        <Campo rotulo="Status" className="sm:col-span-2"><Selecao opcoes={STATUS_PROC} value={f.status} onChange={set('status')} /></Campo>
        <Campo rotulo="Valor da causa (R$)" className="sm:col-span-2"><input className="campo" inputMode="decimal" value={f.valor_causa} onChange={set('valor_causa')} placeholder="0,00" /></Campo>
        <Campo rotulo="Advogado responsável" className="sm:col-span-3"><Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Ninguém" value={f.responsavel_id} onChange={set('responsavel_id')} /></Campo>
        <Campo rotulo="Etiquetas" dica="Separe por vírgula. Ex.: Urgente, Liminar" className="sm:col-span-3"><input className="campo" value={f.etiquetas} onChange={set('etiquetas')} /></Campo>
      </div>
    </Modal>
  );
}

export function ListaProcessos() {
  const [params, setParams] = useSearchParams();
  const { equipeAtiva } = useSessao();
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState({ status: 'Ativo', area: '', fase: '', responsavel_id: '', ordem: 'recentes' });
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(params.get('novo') === '1');
  const termo = useAtraso(busca);
  const nav = useNavigate();
  useEffect(() => setPagina(1), [termo, filtros]);
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/processos', { q: termo, ...filtros, pagina }), [termo, filtros, pagina]);
  const setFil = (k) => (e) => setFiltros({ ...filtros, [k]: e.target.value });
  return (
    <>
      <Cabecalho titulo="Processos" subtitulo="Processos judiciais e casos consultivos do escritório.">
        <button className="btn-primario" onClick={() => setForm(true)}><Plus size={16} />Novo processo</button>
      </Cabecalho>
      <div className="cartao">
        <div className="grid gap-2 border-b border-slate-200 p-4 dark:border-marinho-800 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="campo pl-9" placeholder="Título, nº CNJ, cliente ou parte" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <Selecao opcoes={STATUS_PROC} vazio="Todos os status" value={filtros.status} onChange={setFil('status')} aria-label="Status" />
          <Selecao opcoes={AREAS} vazio="Todas as áreas" value={filtros.area} onChange={setFil('area')} aria-label="Área" />
          <Selecao opcoes={equipeAtiva.map((m) => ({ valor: String(m.id), rotulo: m.nome }))} vazio="Todos os responsáveis" value={filtros.responsavel_id} onChange={setFil('responsavel_id')} aria-label="Responsável" />
          <Selecao opcoes={[{ valor: 'recentes', rotulo: 'Mais recentes' }, { valor: 'titulo', rotulo: 'Título (A-Z)' }, { valor: 'valor', rotulo: 'Maior valor' }]} value={filtros.ordem} onChange={setFil('ordem')} aria-label="Ordenar" />
        </div>
        {carregando && !dados ? <Carregando /> : !dados?.itens.length ? (
          <Vazio titulo="Nenhum processo encontrado" texto={termo || filtros.area ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro processo.'} acao={<button className="btn-primario" onClick={() => setForm(true)}><Plus size={16} />Novo processo</button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Processo</th><th className="hidden md:table-cell">Cliente</th><th className="hidden lg:table-cell">Área / fase</th><th className="hidden lg:table-cell">Responsável</th><th>Status</th></tr></thead>
                <tbody>
                  {dados.itens.map((p) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/app/processos/${p.id}`)}>
                      <td>
                        <Link to={`/app/processos/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-esmeralda-600">{p.titulo}</Link>
                        <p className="font-mono text-xs text-slate-500">{p.numero_cnj || 'Sem número (consultivo/pré-processual)'}</p>
                        {p.etiquetas && <div className="mt-1 flex flex-wrap gap-1">{p.etiquetas.split(',').map((t) => <Selo key={t} cor="marinho">{t}</Selo>)}</div>}
                      </td>
                      <td className="hidden text-slate-600 dark:text-slate-300 md:table-cell">{p.cliente_nome || '—'}</td>
                      <td className="hidden text-slate-500 lg:table-cell">{p.area}<br /><span className="text-xs">{p.fase}</span></td>
                      <td className="hidden text-slate-500 lg:table-cell">{p.responsavel_nome || '—'}</td>
                      <td><Selo cor={corStatusProc[p.status]}>{p.status}</Selo></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao {...dados} onMudar={setPagina} />
          </>
        )}
      </div>
      <FormProcesso aberto={form} clienteInicial={params.get('cliente')} onFechar={() => { setForm(false); if (params.get('novo')) setParams({}); }}
        onSalvo={(id) => { setForm(false); recarregar(); nav(`/app/processos/${id}`); }} />
    </>
  );
}

function Andamentos({ p, recarregar }) {
  const avisar = useAviso();
  const [f, setF] = useState({ data: hojeIso(), descricao: '' });
  const [excluir, setExcluir] = useState(null);
  const enviar = async (e) => {
    e.preventDefault();
    try { await api.post(`/api/processos/${p.id}/andamentos`, f); setF({ data: hojeIso(), descricao: '' }); avisar('Andamento registrado.'); recarregar(); } catch (err) { avisar(err.message, 'erro'); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={enviar} className="cartao h-fit space-y-3 p-5">
        <h3 className="font-semibold">Registrar movimentação</h3>
        <Campo rotulo="Data"><input type="date" className="campo" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required /></Campo>
        <Campo rotulo="Descrição"><textarea rows={4} className="campo" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} required placeholder="Ex.: Juntada de contestação." /></Campo>
        <button className="btn-primario w-full"><Plus size={16} />Adicionar</button>
      </form>
      <div className="cartao p-5 lg:col-span-2">
        {!p.andamentos.length ? <Vazio titulo="Nenhum andamento registrado" /> : (
          <ol className="relative ml-2 border-l-2 border-slate-200 dark:border-marinho-700">
            {p.andamentos.map((a) => (
              <li key={a.id} className="group mb-5 ml-5 last:mb-0">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-esmeralda-500 dark:border-marinho-900" />
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-xs font-semibold text-esmeralda-600">{data(a.data)}</p><p className="mt-0.5 whitespace-pre-line text-sm">{a.descricao}</p>{a.autor && <p className="mt-1 text-xs text-slate-400">por {a.autor}</p>}</div>
                  <button className="btn-icone p-1 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setExcluir(a)} aria-label="Excluir andamento"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Confirmar aberto={!!excluir} onFechar={() => setExcluir(null)} titulo="Excluir andamento" texto="Excluir esta movimentação da linha do tempo?"
        onConfirmar={async () => { await api.del(`/api/andamentos/${excluir.id}`); setExcluir(null); recarregar(); }} />
    </div>
  );
}

function Documentos({ p, recarregar }) {
  const avisar = useAviso();
  const arquivoRef = useRef(null);
  const [cat, setCat] = useState('Petição');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [excluir, setExcluir] = useState(null);
  const enviar = async (e) => {
    e.preventDefault();
    const arq = arquivoRef.current?.files?.[0];
    if (!arq) { avisar('Escolha um arquivo.', 'erro'); return; }
    const fd = new FormData();
    fd.append('arquivo', arq); fd.append('categoria', cat); if (nome) fd.append('nome', nome);
    setEnviando(true);
    try { await api.post(`/api/processos/${p.id}/documentos`, fd); avisar('Documento enviado.'); setNome(''); arquivoRef.current.value = ''; recarregar(); }
    catch (err) { avisar(err.message, 'erro'); } finally { setEnviando(false); }
  };
  const tam = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={enviar} className="cartao h-fit space-y-3 p-5">
        <h3 className="font-semibold">Enviar documento</h3>
        <input ref={arquivoRef} type="file" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marinho-700 file:px-3 file:py-2 file:text-sm file:text-white" />
        <Campo rotulo="Nome (opcional)"><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Usa o nome do arquivo se vazio" /></Campo>
        <Campo rotulo="Categoria"><Selecao opcoes={CATS_DOC} value={cat} onChange={(e) => setCat(e.target.value)} /></Campo>
        <button className="btn-primario w-full" disabled={enviando}><Upload size={16} />{enviando ? 'Enviando…' : 'Enviar'}</button>
        <p className="text-xs text-slate-500">Até 25 MB por arquivo.</p>
      </form>
      <div className="cartao lg:col-span-2">
        {!p.documentos.length ? <Vazio titulo="Nenhum documento" icone={FileText} /> : (
          <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
            {p.documentos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileText size={20} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{d.nome}</p><p className="text-xs text-slate-500">{d.categoria} · {tam(d.tamanho)} · {utcParaLocal(d.criado_em)}{d.enviado_por_nome ? ` · ${d.enviado_por_nome}` : ''}</p></div>
                <a className="btn-icone" href={`/api/documentos/${d.id}/arquivo`} aria-label="Baixar"><Download size={16} /></a>
                <button className="btn-icone" onClick={() => setExcluir(d)} aria-label="Excluir"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Confirmar aberto={!!excluir} onFechar={() => setExcluir(null)} titulo="Excluir documento" texto={`Excluir "${excluir?.nome}" definitivamente?`}
        onConfirmar={async () => { await api.del(`/api/documentos/${excluir.id}`); setExcluir(null); avisar('Documento excluído.'); recarregar(); }} />
    </div>
  );
}

function Anotacoes({ p, recarregar }) {
  const avisar = useAviso();
  const [texto, setTexto] = useState(p.anotacoes || '');
  const mudou = texto !== (p.anotacoes || '');
  const salvar = async () => { try { await api.patch(`/api/processos/${p.id}/anotacoes`, { anotacoes: texto }); avisar('Anotações salvas.'); recarregar(); } catch (e) { avisar(e.message, 'erro'); } };
  return (
    <div className="cartao p-5">
      <textarea rows={12} className="campo leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Estratégia, pendências, observações internas…" />
      <div className="mt-3 flex justify-end gap-2">
        {mudou && <button className="btn-claro" onClick={() => setTexto(p.anotacoes || '')}><X size={16} />Descartar</button>}
        <button className="btn-primario" disabled={!mudou} onClick={salvar}><Save size={16} />Salvar anotações</button>
      </div>
    </div>
  );
}

export function DetalheProcesso() {
  const { id } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const { veFinanceiro } = useSessao();
  const [aba, setAba] = useState('andamentos');
  const [editar, setEditar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [formPrazo, setFormPrazo] = useState(null);
  const [formLanc, setFormLanc] = useState(false);
  const { dados: p, carregando, erro, recarregar } = useCarregar(() => api.get(`/api/processos/${id}`), [id]);
  if (carregando && !p) return <Carregando />;
  if (erro) return <Vazio titulo="Processo não encontrado" acao={<Link to="/app/processos" className="btn-claro">Voltar</Link>} />;
  const abas = [
    { id: 'andamentos', rotulo: 'Andamentos', qtd: p.andamentos.length },
    { id: 'prazos', rotulo: 'Prazos e tarefas', qtd: p.prazos.filter((x) => x.status === 'Pendente').length },
    { id: 'documentos', rotulo: 'Documentos', qtd: p.documentos.length },
    veFinanceiro && { id: 'financeiro', rotulo: 'Financeiro', qtd: p.lancamentos?.length },
    { id: 'anotacoes', rotulo: 'Anotações' },
    { id: 'historico', rotulo: 'Histórico' },
  ].filter(Boolean);
  const info = [
    ['Cliente', p.cliente ? <Link className="text-esmeralda-600 hover:underline" to={`/app/clientes/${p.cliente.id}`}>{p.cliente.nome}</Link> : '—'],
    ['Parte contrária', p.parte_contraria || '—'],
    ['Área', p.area], ['Fase', p.fase],
    ['Tribunal / vara', [p.tribunal, p.vara].filter(Boolean).join(' · ') || '—'],
    ['Comarca', p.comarca || '—'],
    ['Valor da causa', p.valor_causa ? moeda(p.valor_causa) : '—'],
    ['Responsável', p.responsavel?.nome || '—'],
  ];
  return (
    <>
      <Link to="/app/processos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />Processos</Link>
      <Cabecalho titulo={p.titulo} subtitulo={<span className="font-mono">{p.numero_cnj || 'Sem número CNJ'}</span>}>
        <Selo cor={corStatusProc[p.status]} className="self-center">{p.status}</Selo>
        <button className="btn-claro" onClick={() => setEditar(true)}><Pencil size={16} />Editar</button>
        <button className="btn-claro text-red-600" onClick={() => setExcluir(true)}><Trash2 size={16} />Excluir</button>
      </Cabecalho>
      <div className="cartao mb-6 grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm md:grid-cols-4">
        {info.map(([k, v]) => <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-medium">{v}</p></div>)}
        {p.etiquetas && <div className="col-span-2 flex flex-wrap gap-1 md:col-span-4">{p.etiquetas.split(',').map((t) => <Selo key={t} cor="marinho">{t}</Selo>)}</div>}
      </div>
      <Abas abas={abas} ativa={aba} onMudar={setAba} />
      {aba === 'andamentos' && <Andamentos p={p} recarregar={recarregar} />}
      {aba === 'prazos' && (
        <div className="cartao">
          <div className="flex justify-end border-b border-slate-200 p-3 dark:border-marinho-800"><button className="btn-primario" onClick={() => setFormPrazo({})}><Plus size={16} />Novo prazo</button></div>
          {!p.prazos.length ? <Vazio titulo="Nenhum prazo neste processo" /> : (
            <ul className="divide-y divide-slate-100 dark:divide-marinho-800">{p.prazos.map((x) => <LinhaPrazo key={x.id} p={x} mostrarProcesso={false} onEditar={(pz) => setFormPrazo({ prazo: pz })} onMudou={recarregar} />)}</ul>
          )}
        </div>
      )}
      {aba === 'documentos' && <Documentos p={p} recarregar={recarregar} />}
      {aba === 'financeiro' && veFinanceiro && (
        <div className="cartao">
          <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-marinho-800">
            <span className="px-2 text-sm text-slate-500">Recebido: <b className="text-esmeralda-600">{moeda(p.lancamentos.filter((l) => l.tipo === 'receita' && l.pago_em).reduce((s, l) => s + l.valor, 0))}</b> de {moeda(p.lancamentos.filter((l) => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0))}</span>
            <button className="btn-primario" onClick={() => setFormLanc(true)}><Plus size={16} />Novo lançamento</button>
          </div>
          {!p.lancamentos.length ? <Vazio titulo="Nenhum lançamento neste processo" /> : (
            <div className="overflow-x-auto"><table className="tabela"><thead><tr><th>Descrição</th><th>Vencimento</th><th className="text-right">Valor</th><th>Status</th></tr></thead>
              <tbody>{p.lancamentos.map((l) => {
                const st = l.pago_em ? 'Pago' : l.vencimento < hojeIso() ? 'Atrasado' : 'Pendente';
                return <tr key={l.id}><td>{l.descricao}{l.total_parcelas ? ` (${l.parcela}/${l.total_parcelas})` : ''}<p className="text-xs text-slate-500">{l.categoria}</p></td><td>{data(l.vencimento)}</td><td className={`text-right ${l.tipo === 'despesa' ? 'text-red-600' : ''}`}>{l.tipo === 'despesa' ? '−' : ''}{moeda(l.valor)}</td><td><Selo cor={corStatusFin[st]}>{st}</Selo></td></tr>;
              })}</tbody></table></div>
          )}
        </div>
      )}
      {aba === 'anotacoes' && <Anotacoes key={p.anotacoes} p={p} recarregar={recarregar} />}
      {aba === 'historico' && (
        <div className="cartao">
          {!p.historico.length ? <Vazio titulo="Sem registros" /> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-marinho-800">
              {p.historico.map((h, i) => {
                const det = h.detalhes ? JSON.parse(h.detalhes) : null;
                return <li key={i} className="flex flex-wrap justify-between gap-2 px-5 py-3"><span><b>{h.usuario || 'Sistema'}</b> {h.acao}{det?.campos ? `: ${det.campos.join(', ')}` : det?.para ? ` para "${det.para}"` : det?.nome ? `: ${det.nome}` : det?.titulo ? `: ${det.titulo}` : ''}</span><span className="text-slate-500">{utcParaLocal(h.em)}</span></li>;
              })}
            </ul>
          )}
        </div>
      )}
      <FormProcesso aberto={editar} processo={p} onFechar={() => setEditar(false)} onSalvo={() => { setEditar(false); recarregar(); }} />
      <FormPrazo aberto={!!formPrazo} prazo={formPrazo?.prazo} processoId={p.id} onFechar={() => setFormPrazo(null)} onSalvo={() => { setFormPrazo(null); recarregar(); }}
        onExcluir={async (pz) => { await api.del(`/api/prazos/${pz.id}`); setFormPrazo(null); avisar('Prazo excluído.'); recarregar(); }} />
      {veFinanceiro && <FormLancamento aberto={formLanc} padrao={{ processo_id: String(p.id), cliente_id: p.cliente_id ? String(p.cliente_id) : '' }} onFechar={() => setFormLanc(false)} onSalvo={() => { setFormLanc(false); recarregar(); }} />}
      <Confirmar aberto={excluir} onFechar={() => setExcluir(false)} titulo="Excluir processo"
        texto={`Excluir "${p.titulo}"? Andamentos e documentos serão apagados; prazos e lançamentos ficam sem vínculo. Esta ação não pode ser desfeita.`}
        onConfirmar={async () => { try { await api.del(`/api/processos/${p.id}`); avisar('Processo excluído.'); nav('/app/processos'); } catch (e) { avisar(e.message, 'erro'); } }} />
    </>
  );
}
