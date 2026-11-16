import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Download, Check, Undo2, Pencil, Trash2, TrendingUp, TrendingDown, AlertTriangle, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { CAT_RECEITA, CAT_DESPESA, FORMAS_PAG, moeda, data, hojeIso, isoDe, dataDe, mesNome, baixarArquivo } from '../lib/format.js';
import { Cabecalho, Campo, Carregando, Confirmar, Modal, Selecao, Selo, Vazio, corStatusFin, useAviso, useCarregar } from '../components/ui.jsx';
import { useProcessosSimples } from './Prazos.jsx';
import { useClientesSimples } from './Processos.jsx';

const VAZIO = { tipo: 'receita', categoria: 'Honorários contratuais', descricao: '', valor: '', vencimento: '', parcelas: 1, forma_pagamento: 'Pix', cliente_id: '', processo_id: '', pago: false };
const valorNum = (v) => Number(String(v).replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.'));

export function FormLancamento({ aberto, lancamento, padrao, onFechar, onSalvo }) {
  const avisar = useAviso();
  const clientes = useClientesSimples(aberto);
  const processos = useProcessosSimples();
  const [f, setF] = useState(VAZIO);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    if (lancamento) setF({ ...VAZIO, ...lancamento, valor: String(lancamento.valor).replace('.', ','), cliente_id: lancamento.cliente_id ? String(lancamento.cliente_id) : '', processo_id: lancamento.processo_id ? String(lancamento.processo_id) : '', forma_pagamento: lancamento.forma_pagamento || '' });
    else setF({ ...VAZIO, vencimento: hojeIso(), ...padrao });
  }, [aberto, lancamento, padrao]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const v = valorNum(f.valor);
  const n = Math.max(1, Number(f.parcelas) || 1);
  const salvar = async () => {
    if (!f.descricao.trim() || !(v > 0) || !f.vencimento) { avisar('Preencha descrição, valor e vencimento.', 'erro'); return; }
    setOcupado(true);
    try {
      if (lancamento) await api.put(`/api/financeiro/${lancamento.id}`, { ...f, valor: v });
      else await api.post('/api/financeiro', { ...f, valor: v, parcelas: n });
      avisar(lancamento ? 'Lançamento atualizado.' : n > 1 ? `${n} parcelas criadas.` : 'Lançamento criado.');
      onSalvo();
    } catch (e) { avisar(e.message, 'erro'); } finally { setOcupado(false); }
  };
  const cats = f.tipo === 'receita' ? CAT_RECEITA : CAT_DESPESA;
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={lancamento ? 'Editar lançamento' : 'Novo lançamento'} largura="max-w-2xl"
      rodape={<><button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" disabled={ocupado} onClick={salvar}>Salvar</button></>}>
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1 dark:bg-marinho-800 sm:col-span-6">
          {[['receita', 'Receita'], ['despesa', 'Despesa']].map(([t, r]) => (
            <button type="button" key={t} onClick={() => setF({ ...f, tipo: t, categoria: (t === 'receita' ? CAT_RECEITA : CAT_DESPESA)[0] })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${f.tipo === t ? `bg-white shadow dark:bg-marinho-600 ${t === 'receita' ? 'text-esmeralda-600' : 'text-red-600'}` : 'text-slate-500'}`}>{r}</button>
          ))}
        </div>
        <Campo rotulo="Descrição *" className="sm:col-span-4"><input className="campo" value={f.descricao} onChange={set('descricao')} placeholder={f.tipo === 'receita' ? 'Ex.: Honorários — ação de cobrança' : 'Ex.: Custas iniciais'} /></Campo>
        <Campo rotulo="Categoria" className="sm:col-span-2"><Selecao opcoes={cats.includes(f.categoria) ? cats : [f.categoria, ...cats]} value={f.categoria} onChange={set('categoria')} /></Campo>
        <Campo rotulo={lancamento || n === 1 ? 'Valor (R$) *' : 'Valor total (R$) *'} className="sm:col-span-2"><input className="campo" inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" /></Campo>
        <Campo rotulo={lancamento || n === 1 ? 'Vencimento *' : '1º vencimento *'} className="sm:col-span-2"><input type="date" className="campo" value={f.vencimento} onChange={set('vencimento')} /></Campo>
        {!lancamento && <Campo rotulo="Parcelas" className="sm:col-span-2"><input type="number" min="1" max="60" className="campo" value={f.parcelas} onChange={set('parcelas')} /></Campo>}
        {!lancamento && n > 1 && v > 0 && <p className="-mt-2 text-xs text-slate-500 sm:col-span-6">{n}× de aproximadamente {moeda(v / n)}, com vencimentos mensais a partir de {data(f.vencimento)}.</p>}
        <Campo rotulo="Forma de pagamento" className="sm:col-span-2"><Selecao opcoes={FORMAS_PAG} vazio="—" value={f.forma_pagamento} onChange={set('forma_pagamento')} /></Campo>
        <Campo rotulo="Cliente" className="sm:col-span-2"><Selecao opcoes={clientes} vazio="Nenhum" value={f.cliente_id} onChange={set('cliente_id')} /></Campo>
        <Campo rotulo="Processo" className="sm:col-span-2"><Selecao opcoes={processos} vazio="Nenhum" value={f.processo_id} onChange={set('processo_id')} /></Campo>
        {!lancamento && <label className="flex items-center gap-2 text-sm sm:col-span-6"><input type="checkbox" className="accent-esmeralda-500" checked={f.pago} onChange={set('pago')} />{n > 1 ? 'A 1ª parcela já foi paga' : 'Já foi pago'}</label>}
      </div>
    </Modal>
  );
}

function Pagar({ l, onFechar, onPago }) {
  const avisar = useAviso();
  const [d, setD] = useState(hojeIso());
  const [forma, setForma] = useState(l?.forma_pagamento || 'Pix');
  useEffect(() => { if (l) { setD(hojeIso()); setForma(l.forma_pagamento || 'Pix'); } }, [l]);
  return (
    <Modal aberto={!!l} onFechar={onFechar} titulo={l?.tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'} largura="max-w-md"
      rodape={<><button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" onClick={async () => { try { await api.post(`/api/financeiro/${l.id}/pagar`, { pago_em: d, forma_pagamento: forma }); avisar('Pagamento registrado.'); onPago(); } catch (e) { avisar(e.message, 'erro'); } }}><Check size={16} />Confirmar</button></>}>
      {l && <div className="space-y-4">
        <p className="text-sm"><b>{l.descricao}</b>{l.total_parcelas ? ` (${l.parcela}/${l.total_parcelas})` : ''} — {moeda(l.valor)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data do pagamento"><input type="date" className="campo" value={d} onChange={(e) => setD(e.target.value)} /></Campo>
          <Campo rotulo="Forma"><Selecao opcoes={FORMAS_PAG} value={forma} onChange={(e) => setForma(e.target.value)} /></Campo>
        </div>
      </div>}
    </Modal>
  );
}

export default function Financeiro() {
  const [params] = useSearchParams();
  const avisar = useAviso();
  const clientes = useClientesSimples();
  const hoje = dataDe(hojeIso());
  const [mes, setMes] = useState({ a: hoje.getFullYear(), m: hoje.getMonth() });
  const [todoPeriodo, setTodoPeriodo] = useState(!!params.get('status'));
  const [filtros, setFiltros] = useState({ tipo: '', status: params.get('status') || '', cliente_id: '' });
  const [form, setForm] = useState(null);
  const [pagar, setPagar] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const de = isoDe(new Date(mes.a, mes.m, 1)), ate = isoDe(new Date(mes.a, mes.m + 1, 0));
  const consulta = { ...filtros, ...(todoPeriodo ? {} : { de, ate }) };
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/financeiro', consulta), [JSON.stringify(consulta)]);
  const navMes = (d) => setMes(({ a, m }) => { const x = new Date(a, m + d, 1); return { a: x.getFullYear(), m: x.getMonth() }; });
  const t = dados?.totais;
  const setF = (k) => (e) => setFiltros({ ...filtros, [k]: e.target.value });
  return (
    <>
      <Cabecalho titulo="Financeiro" subtitulo="Honorários, custas e despesas do escritório.">
        <button className="btn-claro" onClick={() => baixarArquivo(`/api/financeiro/csv?${new URLSearchParams(Object.entries(consulta).filter(([, v]) => v))}`)}><Download size={16} />Exportar CSV</button>
        <button className="btn-primario" onClick={() => setForm({})}><Plus size={16} />Novo lançamento</button>
      </Cabecalho>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="cartao flex items-center">
          <button className="btn-icone" disabled={todoPeriodo} onClick={() => navMes(-1)} aria-label="Mês anterior">‹</button>
          <span className="w-40 text-center text-sm font-medium">{todoPeriodo ? 'Todo o período' : mesNome(mes.a, mes.m)}</span>
          <button className="btn-icone" disabled={todoPeriodo} onClick={() => navMes(1)} aria-label="Próximo mês">›</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-esmeralda-500" checked={todoPeriodo} onChange={(e) => setTodoPeriodo(e.target.checked)} />Todo o período</label>
        <div className="ml-auto grid w-full grid-cols-3 gap-2 sm:w-auto">
          <Selecao opcoes={[{ valor: 'receita', rotulo: 'Receitas' }, { valor: 'despesa', rotulo: 'Despesas' }]} vazio="Receitas e despesas" value={filtros.tipo} onChange={setF('tipo')} aria-label="Tipo" />
          <Selecao opcoes={['Pendente', 'Pago', 'Atrasado']} vazio="Todos os status" value={filtros.status} onChange={setF('status')} aria-label="Status" />
          <Selecao opcoes={clientes} vazio="Todos os clientes" value={filtros.cliente_id} onChange={setF('cliente_id')} aria-label="Cliente" />
        </div>
      </div>
      {t && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="cartao p-4"><p className="flex items-center gap-1.5 text-xs text-slate-500"><TrendingUp size={14} />Receitas</p><p className="mt-1 text-xl font-semibold text-esmeralda-600">{moeda(t.receitas)}</p><p className="text-xs text-slate-500">Recebido: {moeda(t.recebido)}</p></div>
          <div className="cartao p-4"><p className="flex items-center gap-1.5 text-xs text-slate-500"><TrendingDown size={14} />Despesas</p><p className="mt-1 text-xl font-semibold text-red-600">{moeda(t.despesas)}</p><p className="text-xs text-slate-500">Pago: {moeda(t.pagas)}</p></div>
          <div className="cartao p-4"><p className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet size={14} />Saldo previsto</p><p className={`mt-1 text-xl font-semibold ${t.receitas - t.despesas < 0 ? 'text-red-600' : 'text-marinho-700 dark:text-white'}`}>{moeda(t.receitas - t.despesas)}</p><p className="text-xs text-slate-500">Realizado: {moeda(t.recebido - t.pagas)}</p></div>
          <div className={`cartao p-4 ${t.atrasado ? 'border-red-300 bg-red-50 dark:bg-red-500/10' : ''}`}><p className="flex items-center gap-1.5 text-xs text-slate-500"><AlertTriangle size={14} />Recebimentos atrasados</p><p className={`mt-1 text-xl font-semibold ${t.atrasado ? 'text-red-600' : ''}`}>{moeda(t.atrasado)}</p></div>
        </div>
      )}
      <div className="cartao">
        {carregando && !dados ? <Carregando /> : !dados?.itens.length ? <Vazio titulo="Nenhum lançamento neste período" acao={<button className="btn-primario" onClick={() => setForm({})}><Plus size={16} />Novo lançamento</button>} /> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th className="hidden md:table-cell">Cliente / processo</th><th className="text-right">Valor</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {dados.itens.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{data(l.vencimento)}</td>
                    <td><p className="font-medium">{l.descricao}{l.total_parcelas ? <span className="ml-1 text-xs font-normal text-slate-500">({l.parcela}/{l.total_parcelas})</span> : ''}</p><p className="text-xs text-slate-500">{l.categoria}{l.pago_em ? ` · pago em ${data(l.pago_em)}${l.forma_pagamento ? ' via ' + l.forma_pagamento : ''}` : ''}</p></td>
                    <td className="hidden text-xs text-slate-500 md:table-cell">{l.cliente_nome || '—'}{l.processo_titulo && <><br /><Link to={`/app/processos/${l.processo_id}`} className="hover:underline">{l.processo_titulo}</Link></>}</td>
                    <td className={`whitespace-nowrap text-right font-medium ${l.tipo === 'despesa' ? 'text-red-600' : 'text-esmeralda-700 dark:text-esmeralda-400'}`}>{l.tipo === 'despesa' ? '−' : '+'}{moeda(l.valor)}</td>
                    <td><Selo cor={corStatusFin[l.status]}>{l.status}</Selo></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {l.pago_em
                          ? <button className="btn-icone p-1.5" title="Desfazer pagamento" onClick={async () => { await api.post(`/api/financeiro/${l.id}/estornar`); avisar('Pagamento desfeito.'); recarregar(); }}><Undo2 size={16} /></button>
                          : <button className="btn-claro px-2 py-1 text-xs" onClick={() => setPagar(l)}><Check size={14} />{l.tipo === 'receita' ? 'Recebido' : 'Pago'}</button>}
                        <button className="btn-icone p-1.5" title="Editar" onClick={() => setForm({ lancamento: l })}><Pencil size={16} /></button>
                        <button className="btn-icone p-1.5" title="Excluir" onClick={() => setExcluir(l)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <FormLancamento aberto={!!form} lancamento={form?.lancamento} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); recarregar(); }} />
      <Pagar l={pagar} onFechar={() => setPagar(null)} onPago={() => { setPagar(null); recarregar(); }} />
      <Confirmar aberto={!!excluir} onFechar={() => setExcluir(null)} titulo="Excluir lançamento" texto={`Excluir "${excluir?.descricao}" (${moeda(excluir?.valor)})? As outras parcelas, se houver, continuam.`}
        onConfirmar={async () => { await api.del(`/api/financeiro/${excluir.id}`); setExcluir(null); avisar('Lançamento excluído.'); recarregar(); }} />
    </>
  );
}
