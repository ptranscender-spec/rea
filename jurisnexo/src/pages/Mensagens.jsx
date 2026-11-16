import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare, ArrowLeft, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { utcParaLocal } from '../lib/format.js';
import { Cabecalho, Carregando, Selo, Vazio, useAviso } from '../components/ui.jsx';
import Conversa, { useRepetir } from '../components/Conversa.jsx';

export default function Mensagens() {
  const { clienteId } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const [lista, setLista] = useState(null);
  const [conversa, setConversa] = useState(null);

  const carregarLista = useCallback(() => api.get('/api/mensagens').then(setLista).catch(() => {}), []);
  const carregarConversa = useCallback(() => {
    if (!clienteId) { setConversa(null); return Promise.resolve(); }
    return api.get(`/api/mensagens/${clienteId}`).then((c) => { setConversa(c); window.dispatchEvent(new Event('jn-mensagens-lidas')); })
      .catch((e) => avisar(e.message, 'erro'));
  }, [clienteId, avisar]);
  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => { setConversa(null); carregarConversa().then(carregarLista); }, [carregarConversa, carregarLista]);
  useRepetir(() => { carregarLista(); if (clienteId) carregarConversa(); }, 8000, [clienteId]);

  const enviar = async (texto) => {
    try { await api.post(`/api/mensagens/${clienteId}`, { texto }); await carregarConversa(); carregarLista(); } catch (e) { avisar(e.message, 'erro'); throw e; }
  };

  return (
    <>
      <Cabecalho titulo="Mensagens" subtitulo="Conversas com clientes pelo portal. Atualiza sozinho a cada poucos segundos." />
      <div className="cartao grid overflow-hidden md:grid-cols-[300px_1fr]">
        <aside className={`border-slate-200 dark:border-marinho-800 md:border-r ${clienteId ? 'hidden md:block' : ''}`}>
          {!lista ? <Carregando /> : !lista.length ? (
            <Vazio icone={MessagesSquare} titulo="Nenhuma conversa ainda" texto="Libere o portal na ficha de um cliente para ele poder falar com o escritório." acao={<Link className="btn-claro" to="/app/clientes">Ir para clientes</Link>} />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-marinho-800">
              {lista.map((c) => (
                <li key={c.cliente_id}>
                  <button onClick={() => nav(`/app/mensagens/${c.cliente_id}`)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-marinho-800/50 ${String(c.cliente_id) === clienteId ? 'bg-esmeralda-50 dark:bg-esmeralda-500/10' : ''}`}>
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marinho-100 text-marinho-700 dark:bg-marinho-700 dark:text-white"><User size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate ${c.nao_lidas ? 'font-semibold' : 'font-medium'}`}>{c.nome}</span>
                        {c.nao_lidas > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-esmeralda-500 px-1 text-[11px] font-bold text-white">{c.nao_lidas}</span>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{c.ultima ? `${c.ultimo_autor === 'escritorio' ? 'Você: ' : ''}${c.ultima}` : 'Portal liberado — sem mensagens'}</span>
                      {c.quando && <span className="text-[10px] text-slate-400">{utcParaLocal(c.quando)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className={`${clienteId ? '' : 'hidden md:block'} min-w-0 bg-slate-50 dark:bg-marinho-950/40`}>
          {!clienteId ? <Vazio icone={MessagesSquare} titulo="Escolha uma conversa" /> : !conversa ? <Carregando /> : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-marinho-800 dark:bg-marinho-900">
                <button className="btn-icone md:hidden" onClick={() => nav('/app/mensagens')} aria-label="Voltar"><ArrowLeft size={18} /></button>
                <Link to={`/app/clientes/${conversa.cliente.id}`} className="font-semibold hover:text-esmeralda-600">{conversa.cliente.nome}</Link>
                {!conversa.cliente.portal_ativo && <Selo cor="amarelo">Portal desativado</Selo>}
              </div>
              <Conversa itens={conversa.itens} meu="escritorio" onEnviar={enviar} vazio="Envie a primeira mensagem para o cliente." />
            </>
          )}
        </section>
      </div>
    </>
  );
}
