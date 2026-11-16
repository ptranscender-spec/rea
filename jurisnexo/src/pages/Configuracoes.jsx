import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil, Check, X, Database, Copy } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { PAPEIS, data, mascaraCNPJ, mascaraTel, cnpjValido, hojeIso } from '../lib/format.js';
import { Abas, Cabecalho, Campo, Carregando, Confirmar, Selecao, Selo, Vazio, useAviso, useCarregar } from '../components/ui.jsx';

function Escritorio() {
  const { escritorio, atualizar, ehAdmin } = useSessao();
  const avisar = useAviso();
  const [f, setF] = useState({ nome: '', cnpj: '', oab: '', telefone: '', email: '' });
  useEffect(() => { if (escritorio) setF(Object.fromEntries(Object.keys(f).map((k) => [k, escritorio[k] || '']))); }, [escritorio]); // eslint-disable-line
  const salvar = async (e) => {
    e.preventDefault();
    if (f.cnpj && !cnpjValido(f.cnpj)) { avisar('CNPJ inválido.', 'erro'); return; }
    try { await api.put('/api/config/escritorio', f); await atualizar(); avisar('Dados do escritório salvos.'); } catch (err) { avisar(err.message, 'erro'); }
  };
  const set = (k, m = (v) => v) => (e) => setF({ ...f, [k]: m(e.target.value) });
  return (
    <form onSubmit={salvar} className="cartao max-w-2xl space-y-4 p-5">
      <fieldset disabled={!ehAdmin} className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do escritório *" className="sm:col-span-2"><input className="campo" value={f.nome} onChange={set('nome')} required /></Campo>
        <Campo rotulo="CNPJ"><input className="campo" value={f.cnpj} onChange={set('cnpj', mascaraCNPJ)} /></Campo>
        <Campo rotulo="OAB/UF do responsável"><input className="campo" value={f.oab} onChange={set('oab')} /></Campo>
        <Campo rotulo="Telefone"><input className="campo" value={f.telefone} onChange={set('telefone', mascaraTel)} /></Campo>
        <Campo rotulo="E-mail"><input type="email" className="campo" value={f.email} onChange={set('email')} /></Campo>
      </fieldset>
      {ehAdmin ? <button className="btn-primario">Salvar</button> : <p className="text-sm text-slate-500">Apenas administradores podem alterar estes dados.</p>}
    </form>
  );
}

function Membros() {
  const { usuario, atualizar, ehAdmin } = useSessao();
  const avisar = useAviso();
  const { dados, recarregar } = useCarregar(() => api.get('/api/equipe'), []);
  const [f, setF] = useState({ nome: '', email: '', papel: 'advogado' });
  const [convidado, setConvidado] = useState(null);
  const [remover, setRemover] = useState(null);
  const atualizarTudo = () => { recarregar(); atualizar(); };
  const convidar = async (e) => {
    e.preventDefault();
    try { await api.post('/api/config/membros', f); setConvidado(f.email); setF({ nome: '', email: '', papel: 'advogado' }); atualizarTudo(); } catch (err) { avisar(err.message, 'erro'); }
  };
  const mudar = async (m, corpo) => { try { await api.put(`/api/config/membros/${m.id}`, corpo); avisar('Membro atualizado.'); atualizarTudo(); } catch (e) { avisar(e.message, 'erro'); } };
  const link = convidado ? `${window.location.origin}/cadastro?email=${encodeURIComponent(convidado)}` : '';
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {ehAdmin && (
        <form onSubmit={convidar} className="cartao h-fit space-y-3 p-5">
          <h3 className="font-semibold">Convidar membro</h3>
          <Campo rotulo="Nome"><input className="campo" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="E-mail"><input type="email" className="campo" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo rotulo="Papel"><Selecao opcoes={Object.entries(PAPEIS).map(([valor, rotulo]) => ({ valor, rotulo }))} value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} /></Campo>
          <button className="btn-primario w-full"><Plus size={16} />Convidar</button>
          {convidado && (
            <div className="rounded-lg bg-esmeralda-50 p-3 text-xs text-slate-700 dark:bg-esmeralda-500/10 dark:text-slate-200">
              Envie este link para a pessoa criar a senha. Ela entra direto no seu escritório:
              <div className="mt-2 flex gap-1"><input readOnly className="campo py-1 text-xs" value={link} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-claro px-2" onClick={() => { navigator.clipboard?.writeText(link); avisar('Link copiado.'); }} aria-label="Copiar link"><Copy size={14} /></button></div>
            </div>
          )}
          <p className="text-xs text-slate-500"><b>Estagiário/Assistente</b> não vê o Financeiro. <b>Administrador</b> gerencia equipe e configurações.</p>
        </form>
      )}
      <div className={`cartao ${ehAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
        {!dados ? <Carregando /> : (
          <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
            {dados.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-marinho-100 text-sm font-semibold text-marinho-700 dark:bg-marinho-700 dark:text-white">{m.nome.split(' ').filter((p) => !p.endsWith('.')).slice(0, 2).map((p) => p[0]).join('')}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.nome} {m.id === usuario.id && <span className="text-xs text-slate-500">(você)</span>}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                {m.pendente ? <Selo cor="amarelo">Convite pendente</Selo> : !m.ativo && <Selo cor="cinza">Desativado</Selo>}
                {ehAdmin && m.id !== usuario.id ? (
                  <div className="flex items-center gap-1">
                    <select className="campo w-44 py-1.5" value={m.papel} onChange={(e) => mudar(m, { papel: e.target.value })} aria-label={`Papel de ${m.nome}`}>
                      {Object.entries(PAPEIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                    {m.pendente
                      ? <button className="btn-icone" onClick={() => setRemover(m)} aria-label="Cancelar convite"><Trash2 size={16} /></button>
                      : <button className="btn-claro px-2 py-1.5 text-xs" onClick={() => mudar(m, { ativo: !m.ativo })}>{m.ativo ? 'Desativar' : 'Reativar'}</button>}
                  </div>
                ) : <Selo cor="marinho">{PAPEIS[m.papel]}</Selo>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Confirmar aberto={!!remover} onFechar={() => setRemover(null)} titulo="Cancelar convite" texto={`Cancelar o convite de ${remover?.nome}?`} rotulo="Cancelar convite"
        onConfirmar={async () => { await api.del(`/api/config/membros/${remover.id}`); setRemover(null); atualizarTudo(); }} />
    </div>
  );
}

function Colunas() {
  const { ehAdmin } = useSessao();
  const avisar = useAviso();
  const { dados, recarregar } = useCarregar(() => api.get('/api/config/colunas'), []);
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const tentar = (fn) => async (...a) => { try { await fn(...a); recarregar(); } catch (e) { avisar(e.message, 'erro'); } };
  const mover = tentar(async (i, d) => { const ids = dados.map((c) => c.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; await api.post('/api/config/colunas/ordem', { ids }); });
  if (!dados) return <Carregando />;
  return (
    <div className="cartao max-w-xl">
      <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
        {dados.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
            <span className="w-6 text-center text-xs text-slate-400">{i + 1}</span>
            {editando?.id === c.id ? (
              <>
                <input className="campo flex-1 py-1.5" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus />
                <button className="btn-icone" onClick={tentar(async () => { await api.put(`/api/config/colunas/${c.id}`, { nome: editando.nome }); setEditando(null); })} aria-label="Salvar"><Check size={16} /></button>
                <button className="btn-icone" onClick={() => setEditando(null)} aria-label="Cancelar"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{c.nome}</span>
                {ehAdmin && <>
                  <button className="btn-icone p-1.5" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp size={15} /></button>
                  <button className="btn-icone p-1.5" disabled={i === dados.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown size={15} /></button>
                  <button className="btn-icone p-1.5" onClick={() => setEditando(c)} aria-label="Renomear"><Pencil size={15} /></button>
                  <button className="btn-icone p-1.5" onClick={() => setExcluir(c)} aria-label="Excluir"><Trash2 size={15} /></button>
                </>}
              </>
            )}
          </li>
        ))}
      </ul>
      {ehAdmin && (
        <form className="flex gap-2 border-t border-slate-200 p-4 dark:border-marinho-800" onSubmit={(e) => { e.preventDefault(); if (nova.trim()) tentar(async () => { await api.post('/api/config/colunas', { nome: nova }); setNova(''); })(); }}>
          <input className="campo" placeholder="Nova coluna" value={nova} onChange={(e) => setNova(e.target.value)} />
          <button className="btn-primario"><Plus size={16} />Adicionar</button>
        </form>
      )}
      <Confirmar aberto={!!excluir} onFechar={() => setExcluir(null)} titulo="Excluir coluna" texto={`Excluir "${excluir?.nome}"? Os processos dela vão para a primeira coluna.`}
        onConfirmar={tentar(async () => { await api.del(`/api/config/colunas/${excluir.id}`); setExcluir(null); })} />
    </div>
  );
}

function Etiquetas() {
  const { dados } = useCarregar(() => api.get('/api/config/etiquetas'), []);
  if (!dados) return <Carregando />;
  return (
    <div className="cartao max-w-xl p-5">
      <p className="mb-3 text-sm text-slate-500">As etiquetas são criadas ao digitá-las no cadastro do processo (separadas por vírgula). Estas estão em uso:</p>
      {!dados.length ? <Vazio titulo="Nenhuma etiqueta em uso" /> : <div className="flex flex-wrap gap-2">{dados.map((t) => <Selo key={t} cor="marinho" className="px-3 py-1 text-sm">{t}</Selo>)}</div>}
    </div>
  );
}

function Feriados() {
  const { ehAdmin } = useSessao();
  const avisar = useAviso();
  const { dados, recarregar } = useCarregar(() => api.get('/api/config/feriados'), []);
  const [f, setF] = useState({ data: '', nome: '' });
  const [ano, setAno] = useState(Number(hojeIso().slice(0, 4)) + 1);
  const tentar = (fn) => async (e) => { e?.preventDefault(); try { await fn(); recarregar(); } catch (err) { avisar(err.message, 'erro'); } };
  if (!dados) return <Carregando />;
  const anos = [...new Set(dados.map((x) => x.data.slice(0, 4)))];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {ehAdmin && (
        <div className="space-y-4">
          <form onSubmit={tentar(async () => { await api.post('/api/config/feriados', f); setF({ data: '', nome: '' }); avisar('Feriado adicionado.'); })} className="cartao space-y-3 p-5">
            <h3 className="font-semibold">Adicionar feriado ou suspensão</h3>
            <p className="text-xs text-slate-500">Inclua feriados estaduais, municipais e dias de suspensão do expediente forense (ex.: recesso de 20/12 a 20/01).</p>
            <Campo rotulo="Data"><input type="date" className="campo" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
            <Campo rotulo="Descrição"><input className="campo" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Aniversário da cidade" /></Campo>
            <button className="btn-primario w-full"><Plus size={16} />Adicionar</button>
          </form>
          <form onSubmit={tentar(async () => { const r = await api.post('/api/config/feriados/nacionais', { ano }); avisar(`${r.adicionados} feriados nacionais adicionados.`); })} className="cartao space-y-3 p-5">
            <h3 className="font-semibold">Feriados nacionais de outro ano</h3>
            <div className="flex gap-2"><input type="number" className="campo" value={ano} onChange={(e) => setAno(e.target.value)} /><button className="btn-escuro whitespace-nowrap">Adicionar</button></div>
          </form>
        </div>
      )}
      <div className={`cartao ${ehAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
        {anos.map((a) => (
          <div key={a}>
            <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold dark:border-marinho-800 dark:bg-marinho-800/50">{a}</p>
            <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
              {dados.filter((x) => x.data.startsWith(a)).map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-24 font-mono text-slate-500">{data(x.data)}</span>
                  <span className="flex-1">{x.nome}</span>
                  {ehAdmin && <button className="btn-icone p-1" onClick={tentar(async () => { await api.del(`/api/config/feriados/${x.id}`); })} aria-label={`Excluir ${x.nome}`}><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Demo() {
  const avisar = useAviso();
  const { atualizar } = useSessao();
  const [ocupado, setOcupado] = useState(false);
  const [portal, setPortal] = useState(null);
  const carregar = async () => {
    setOcupado(true);
    try { const r = await api.post('/api/config/demo'); await atualizar(); avisar(r.mensagem); if (r.portal) setPortal(r.portal); } catch (e) { avisar(e.message, 'erro'); } finally { setOcupado(false); }
  };
  return (
    <div className="cartao max-w-xl p-6">
      <Database className="text-esmeralda-500" size={28} />
      <h3 className="mt-3 text-lg font-semibold">Dados de demonstração</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Cria 5 clientes, 6 processos com andamentos, prazos (inclusive atrasados e de hoje), compromissos na agenda, lançamentos financeiros parcelados, 2 membros fictícios e o portal de uma cliente com conversa iniciada. Tudo fica marcado como "demo" e pode ser apagado depois.</p>
      <button className="btn-primario mt-4" disabled={ocupado} onClick={carregar}>{ocupado ? 'Carregando…' : 'Carregar dados de demonstração'}</button>
      {portal && (
        <div className="mt-4 rounded-lg bg-esmeralda-50 p-4 text-sm dark:bg-esmeralda-500/10">
          <p className="font-semibold">Teste o portal do cliente como a Mariana:</p>
          <p className="mt-1">Endereço: <a className="text-esmeralda-700 underline dark:text-esmeralda-400" href="/portal/entrar" target="_blank" rel="noreferrer">{window.location.origin}/portal/entrar</a></p>
          <p>E-mail: <b>{portal.email}</b></p>
          <p>Senha: <b>{portal.senha}</b></p>
          <p className="mt-1 text-xs text-slate-500">Dica: abra numa janela anônima para ficar logado nos dois ao mesmo tempo.</p>
        </div>
      )}
    </div>
  );
}

export default function Configuracoes() {
  const { ehAdmin } = useSessao();
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') || 'escritorio';
  const abas = [
    { id: 'escritorio', rotulo: 'Escritório' },
    { id: 'membros', rotulo: 'Equipe' },
    { id: 'kanban', rotulo: 'Colunas do Kanban' },
    { id: 'etiquetas', rotulo: 'Etiquetas' },
    { id: 'feriados', rotulo: 'Feriados' },
    ehAdmin && { id: 'demo', rotulo: 'Dados de demonstração' },
  ].filter(Boolean);
  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo={ehAdmin ? 'Ajuste o escritório, a equipe e as preferências.' : 'Somente administradores podem alterar as configurações.'} />
      <Abas abas={abas} ativa={aba} onMudar={(a) => setParams({ aba: a })} />
      {aba === 'escritorio' && <Escritorio />}
      {aba === 'membros' && <Membros />}
      {aba === 'kanban' && <Colunas />}
      {aba === 'etiquetas' && <Etiquetas />}
      {aba === 'feriados' && <Feriados />}
      {aba === 'demo' && ehAdmin && <Demo />}
    </>
  );
}
