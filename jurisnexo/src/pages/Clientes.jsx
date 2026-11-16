import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, MessageCircle, Building2, User, ArrowLeft, KeyRound, Copy, MessagesSquare } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import {
  mascaraCPF, mascaraCNPJ, mascaraCEP, mascaraTel, cpfValido, cnpjValido, UFS, data, dataHora, moeda, hojeIso, utcParaLocal,
} from '../lib/format.js';
import {
  Cabecalho, Campo, Carregando, Confirmar, Modal, Paginacao, Selecao, Selo, Vazio, useAviso, useAtraso, useCarregar,
  corStatusProc, corStatusFin,
} from '../components/ui.jsx';

const VAZIO = { tipo: 'PF', nome: '', documento: '', rg: '', nascimento: '', telefone: '', whatsapp: '', email: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', observacoes: '' };

export function FormCliente({ aberto, cliente, onFechar, onSalvo }) {
  const [f, setF] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const avisar = useAviso();
  useEffect(() => { if (aberto) { setF(cliente ? { ...VAZIO, ...Object.fromEntries(Object.entries(cliente).map(([k, v]) => [k, v ?? ''])) } : VAZIO); setErros({}); } }, [aberto, cliente]);
  const pf = f.tipo === 'PF';
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const buscarCep = async (cep) => {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) setErros((e) => ({ ...e, cep: 'CEP não encontrado.' }));
      else { setErros((e) => ({ ...e, cep: undefined })); setF((x) => ({ ...x, logradouro: j.logradouro || x.logradouro, bairro: j.bairro || x.bairro, cidade: j.localidade || x.cidade, uf: j.uf || x.uf })); }
    } catch { setErros((e) => ({ ...e, cep: 'Não foi possível consultar o CEP agora. Preencha manualmente.' })); }
    finally { setBuscandoCep(false); }
  };
  const salvar = async (e) => {
    e?.preventDefault();
    const er = {};
    if (!f.nome.trim()) er.nome = 'Obrigatório.';
    if (f.documento && pf && !cpfValido(f.documento)) er.documento = 'CPF inválido.';
    if (f.documento && !pf && !cnpjValido(f.documento)) er.documento = 'CNPJ inválido.';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) er.email = 'E-mail inválido.';
    setErros(er);
    if (Object.keys(er).length) return;
    setOcupado(true);
    try {
      const r = cliente ? await api.put(`/api/clientes/${cliente.id}`, f) : await api.post('/api/clientes', f);
      avisar(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      onSalvo(r.id);
    } catch (err) { avisar(err.message, 'erro'); } finally { setOcupado(false); }
  };
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={cliente ? 'Editar cliente' : 'Novo cliente'} largura="max-w-2xl"
      rodape={<><button className="btn-claro" onClick={onFechar}>Cancelar</button><button className="btn-primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar'}</button></>}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-marinho-800">
          {[['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']].map(([v, r]) => (
            <button type="button" key={v} onClick={() => setF({ ...f, tipo: v, documento: '' })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${f.tipo === v ? 'bg-white shadow dark:bg-marinho-600' : 'text-slate-500'}`}>{r}</button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo={pf ? 'Nome completo *' : 'Razão social *'} erro={erros.nome} className="sm:col-span-4"><input className="campo" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
          <Campo rotulo={pf ? 'CPF' : 'CNPJ'} erro={erros.documento} className="sm:col-span-2">
            <input className="campo" inputMode="numeric" value={f.documento} onChange={(e) => set('documento', pf ? mascaraCPF(e.target.value) : mascaraCNPJ(e.target.value))} placeholder={pf ? '000.000.000-00' : '00.000.000/0000-00'} />
          </Campo>
          {pf && <>
            <Campo rotulo="RG" className="sm:col-span-3"><input className="campo" value={f.rg} onChange={(e) => set('rg', e.target.value)} /></Campo>
            <Campo rotulo="Data de nascimento" className="sm:col-span-3"><input type="date" className="campo" value={f.nascimento} onChange={(e) => set('nascimento', e.target.value)} /></Campo>
          </>}
          <Campo rotulo="Telefone" className="sm:col-span-2"><input className="campo" inputMode="tel" value={f.telefone} onChange={(e) => set('telefone', mascaraTel(e.target.value))} /></Campo>
          <Campo rotulo="WhatsApp" className="sm:col-span-2"><input className="campo" inputMode="tel" value={f.whatsapp} onChange={(e) => set('whatsapp', mascaraTel(e.target.value))} /></Campo>
          <Campo rotulo="E-mail" erro={erros.email} className="sm:col-span-2"><input type="email" className="campo" value={f.email} onChange={(e) => set('email', e.target.value)} /></Campo>
          <Campo rotulo="CEP" erro={erros.cep} dica={buscandoCep ? 'Buscando endereço…' : 'O endereço é preenchido automaticamente.'} className="sm:col-span-2">
            <input className="campo" inputMode="numeric" value={f.cep} onChange={(e) => { const v = mascaraCEP(e.target.value); set('cep', v); buscarCep(v); }} placeholder="00000-000" />
          </Campo>
          <Campo rotulo="Logradouro" className="sm:col-span-4"><input className="campo" value={f.logradouro} onChange={(e) => set('logradouro', e.target.value)} /></Campo>
          <Campo rotulo="Número" className="sm:col-span-1"><input className="campo" value={f.numero} onChange={(e) => set('numero', e.target.value)} /></Campo>
          <Campo rotulo="Complemento" className="sm:col-span-2"><input className="campo" value={f.complemento} onChange={(e) => set('complemento', e.target.value)} /></Campo>
          <Campo rotulo="Bairro" className="sm:col-span-3"><input className="campo" value={f.bairro} onChange={(e) => set('bairro', e.target.value)} /></Campo>
          <Campo rotulo="Cidade" className="sm:col-span-4"><input className="campo" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></Campo>
          <Campo rotulo="UF" className="sm:col-span-2"><Selecao opcoes={UFS} vazio="—" value={f.uf} onChange={(e) => set('uf', e.target.value)} /></Campo>
          <Campo rotulo="Observações" className="sm:col-span-6"><textarea rows={3} className="campo" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function ListaClientes() {
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [ordem, setOrdem] = useState('nome');
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(params.get('novo') === '1');
  const termo = useAtraso(busca);
  const nav = useNavigate();
  useEffect(() => setPagina(1), [termo, tipo, ordem]);
  const { dados, carregando, recarregar } = useCarregar(() => api.get('/api/clientes', { q: termo, tipo, ordem, pagina }), [termo, tipo, ordem, pagina]);
  return (
    <>
      <Cabecalho titulo="Clientes" subtitulo="Pessoas físicas e jurídicas atendidas pelo escritório.">
        <button className="btn-primario" onClick={() => setForm(true)}><Plus size={16} />Novo cliente</button>
      </Cabecalho>
      <div className="cartao">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-marinho-800 sm:flex-row">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="campo pl-9" placeholder="Buscar por nome, CPF/CNPJ ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="w-full sm:w-44"><Selecao opcoes={[{ valor: 'PF', rotulo: 'Pessoa física' }, { valor: 'PJ', rotulo: 'Pessoa jurídica' }]} vazio="Todos os tipos" value={tipo} onChange={(e) => setTipo(e.target.value)} /></div>
          <div className="w-full sm:w-44"><Selecao opcoes={[{ valor: 'nome', rotulo: 'Ordem: nome' }, { valor: 'recentes', rotulo: 'Mais recentes' }]} value={ordem} onChange={(e) => setOrdem(e.target.value)} /></div>
        </div>
        {carregando && !dados ? <Carregando /> : !dados?.itens.length ? (
          <Vazio titulo={termo || tipo ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'} texto={termo || tipo ? 'Tente outra busca.' : 'Cadastre o primeiro cliente do escritório.'}
            acao={!termo && !tipo && <button className="btn-primario" onClick={() => setForm(true)}><Plus size={16} />Novo cliente</button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th className="hidden md:table-cell">Contato</th><th className="hidden lg:table-cell">Cidade</th><th className="text-center">Processos</th></tr></thead>
                <tbody>
                  {dados.itens.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/app/clientes/${c.id}`)}>
                      <td><div className="flex items-center gap-2">{c.tipo === 'PJ' ? <Building2 size={16} className="text-slate-400" /> : <User size={16} className="text-slate-400" />}<Link to={`/app/clientes/${c.id}`} className="font-medium hover:text-esmeralda-600" onClick={(e) => e.stopPropagation()}>{c.nome}</Link></div></td>
                      <td className="whitespace-nowrap text-slate-500">{c.documento || '—'}</td>
                      <td className="hidden text-slate-500 md:table-cell">{c.telefone || c.email || '—'}</td>
                      <td className="hidden text-slate-500 lg:table-cell">{c.cidade ? `${c.cidade}/${c.uf || ''}` : '—'}</td>
                      <td className="text-center">{c.n_processos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao {...dados} onMudar={setPagina} />
          </>
        )}
      </div>
      <FormCliente aberto={form} onFechar={() => { setForm(false); if (params.get('novo')) setParams({}); }} onSalvo={(id) => { setForm(false); recarregar(); nav(`/app/clientes/${id}`); }} />
    </>
  );
}

function CartaoPortal({ c, recarregar }) {
  const avisar = useAviso();
  const [link, setLink] = useState('');
  const [desativar, setDesativar] = useState(false);
  const gerar = async () => {
    try { const r = await api.post(`/api/clientes/${c.id}/portal`); setLink(`${window.location.origin}/portal/ativar/${r.token}`); recarregar(); }
    catch (e) { avisar(e.message, 'erro'); }
  };
  const zap = c.whatsapp?.replace(/\D/g, '');
  const textoZap = encodeURIComponent(`Olá, ${c.nome.split(' ')[0]}! Liberamos seu acesso ao portal do escritório, onde você acompanha seu processo e fala com a gente. Crie sua senha neste link: ${link}`);
  return (
    <section className="cartao space-y-3 p-5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={16} className="text-esmeralda-500" />Portal do cliente</h2>
        {c.portal_ativo ? <Selo cor="verde">Ativo</Selo> : c.portal_pendente ? <Selo cor="amarelo">Aguardando 1º acesso</Selo> : <Selo cor="cinza">Desligado</Selo>}
      </div>
      <p className="text-slate-500">{c.portal_ativo
        ? `O cliente acompanha os processos, envia documentos e conversa com o escritório.${c.portal_ultimo_acesso ? ` Último acesso: ${utcParaLocal(c.portal_ultimo_acesso)}.` : ''}`
        : 'Gere um link para o cliente criar a senha e acompanhar o caso pela internet.'}</p>
      {link && (
        <div className="space-y-2 rounded-lg bg-esmeralda-50 p-3 dark:bg-esmeralda-500/10">
          <p className="text-xs text-slate-600 dark:text-slate-300">Envie este link ao cliente (vale para um único acesso):</p>
          <div className="flex gap-1"><input readOnly className="campo py-1 text-xs" value={link} onFocus={(e) => e.target.select()} aria-label="Link do portal" />
            <button className="btn-claro px-2" onClick={() => { navigator.clipboard?.writeText(link); avisar('Link copiado.'); }} aria-label="Copiar link"><Copy size={14} /></button></div>
          {zap && <a className="btn-primario w-full text-xs" target="_blank" rel="noreferrer" href={`https://wa.me/55${zap}?text=${textoZap}`}><MessageCircle size={14} />Enviar pelo WhatsApp</a>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-claro" onClick={gerar}>{c.portal_ativo ? 'Gerar link de nova senha' : c.portal_pendente ? 'Gerar novo link' : 'Liberar acesso'}</button>
        {(c.portal_ativo || c.portal_pendente) && <button className="btn-claro text-red-600" onClick={() => setDesativar(true)}>Desligar</button>}
        <Link to={`/app/mensagens/${c.id}`} className="btn-claro"><MessagesSquare size={16} />Mensagens</Link>
      </div>
      {!c.email && <p className="text-xs text-amber-700 dark:text-amber-300">Cadastre o e-mail do cliente para liberar o portal.</p>}
      <Confirmar aberto={desativar} onFechar={() => setDesativar(false)} titulo="Desligar portal" rotulo="Desligar"
        texto="O cliente perde o acesso imediatamente. As mensagens ficam guardadas."
        onConfirmar={async () => { await api.del(`/api/clientes/${c.id}/portal`); setDesativar(false); setLink(''); avisar('Portal desligado.'); recarregar(); }} />
    </section>
  );
}

export function DetalheCliente() {
  const { id } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const { veFinanceiro } = useSessao();
  const [editar, setEditar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const { dados: c, carregando, erro, recarregar } = useCarregar(() => api.get(`/api/clientes/${id}`), [id]);
  if (carregando && !c) return <Carregando />;
  if (erro) return <Vazio titulo="Cliente não encontrado" acao={<Link to="/app/clientes" className="btn-claro">Voltar</Link>} />;
  const zap = c.whatsapp?.replace(/\D/g, '');
  const endereco = [c.logradouro && `${c.logradouro}${c.numero ? ', ' + c.numero : ''}`, c.complemento, c.bairro, c.cidade && `${c.cidade}/${c.uf || ''}`, c.cep].filter(Boolean).join(' · ');
  return (
    <>
      <Link to="/app/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />Clientes</Link>
      <Cabecalho titulo={c.nome} subtitulo={`${c.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}${c.documento ? ' · ' + c.documento : ''}`}>
        <button className="btn-claro" onClick={() => setEditar(true)}><Pencil size={16} />Editar</button>
        <button className="btn-claro text-red-600" onClick={() => setExcluir(true)}><Trash2 size={16} />Excluir</button>
        <Link to={`/app/processos?novo=1&cliente=${c.id}`} className="btn-primario"><Plus size={16} />Novo processo</Link>
      </Cabecalho>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6">
        <section className="cartao space-y-3 p-5 text-sm">
          <h2 className="font-semibold">Contato</h2>
          {c.telefone && <p className="flex items-center gap-2"><Phone size={16} className="text-slate-400" />{c.telefone}</p>}
          {zap && <a className="flex items-center gap-2 text-esmeralda-600 hover:underline" href={`https://wa.me/55${zap}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp {c.whatsapp}</a>}
          {c.email && <a className="flex items-center gap-2 hover:underline" href={`mailto:${c.email}`}><Mail size={16} className="text-slate-400" />{c.email}</a>}
          {endereco && <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />{endereco}</p>}
          {c.tipo === 'PF' && (c.rg || c.nascimento) && <p className="text-slate-500">{c.rg && `RG ${c.rg}`}{c.rg && c.nascimento && ' · '}{c.nascimento && `Nascimento: ${data(c.nascimento)}`}</p>}
          {c.observacoes && <div className="rounded-lg bg-slate-50 p-3 text-slate-600 dark:bg-marinho-800 dark:text-slate-300">{c.observacoes}</div>}
          {!c.telefone && !c.email && !endereco && <p className="text-slate-500">Nenhum contato cadastrado.</p>}
        </section>
          <CartaoPortal c={c} recarregar={recarregar} />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="cartao">
            <h2 className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-marinho-800">Processos ({c.processos.length})</h2>
            {!c.processos.length ? <Vazio titulo="Nenhum processo deste cliente" /> : (
              <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
                {c.processos.map((p) => (
                  <li key={p.id}><Link to={`/app/processos/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-marinho-800/40">
                    <span className="min-w-0"><span className="block truncate font-medium">{p.titulo}</span><span className="text-xs text-slate-500">{p.numero_cnj || 'Sem número'} · {p.area}</span></span>
                    <Selo cor={corStatusProc[p.status]}>{p.status}</Selo>
                  </Link></li>
                ))}
              </ul>
            )}
          </section>
          <section className="cartao">
            <h2 className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-marinho-800">Compromissos</h2>
            {!c.eventos.length ? <Vazio titulo="Nenhum compromisso" /> : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-marinho-800">
                {c.eventos.map((e) => <li key={e.id} className="flex justify-between gap-3 px-5 py-3"><span>{e.titulo}</span><span className="text-slate-500">{dataHora(e.inicio)}</span></li>)}
              </ul>
            )}
          </section>
          {veFinanceiro && c.lancamentos && (
            <section className="cartao">
              <h2 className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-marinho-800">Financeiro</h2>
              {!c.lancamentos.length ? <Vazio titulo="Nenhum lançamento" /> : (
                <div className="overflow-x-auto"><table className="tabela"><thead><tr><th>Descrição</th><th>Vencimento</th><th className="text-right">Valor</th><th>Status</th></tr></thead>
                  <tbody>{c.lancamentos.map((l) => {
                    const st = l.pago_em ? 'Pago' : l.vencimento < hojeIso() ? 'Atrasado' : 'Pendente';
                    return <tr key={l.id}><td>{l.descricao}{l.total_parcelas ? ` (${l.parcela}/${l.total_parcelas})` : ''}</td><td>{data(l.vencimento)}</td><td className={`text-right ${l.tipo === 'despesa' ? 'text-red-600' : ''}`}>{moeda(l.valor)}</td><td><Selo cor={corStatusFin[st]}>{st}</Selo></td></tr>;
                  })}</tbody></table></div>
              )}
            </section>
          )}
        </div>
      </div>
      <FormCliente aberto={editar} cliente={c} onFechar={() => setEditar(false)} onSalvo={() => { setEditar(false); recarregar(); }} />
      <Confirmar aberto={excluir} onFechar={() => setExcluir(false)} titulo="Excluir cliente"
        texto={`Excluir "${c.nome}"? Os processos dele continuarão existindo, mas sem cliente vinculado. Esta ação não pode ser desfeita.`}
        onConfirmar={async () => { try { await api.del(`/api/clientes/${c.id}`); avisar('Cliente excluído.'); nav('/app/clientes'); } catch (e) { avisar(e.message, 'erro'); } }} />
    </>
  );
}
