import { Link } from 'react-router-dom';
import { Scale, AlarmClock, AlertTriangle, CalendarDays, TrendingUp, Clock, Wallet, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSessao } from '../lib/sessao.jsx';
import { moeda, moedaCurta, data, hora, dataLonga, situacaoPrazo } from '../lib/format.js';
import { Cabecalho, Carregando, Selo, Vazio, useCarregar } from '../components/ui.jsx';

function Indicador({ icone: I, rotulo, valor, cor = 'text-marinho-700 dark:text-white', destaque, to }) {
  const corpo = (
    <div className={`cartao h-full p-4 transition ${to ? 'hover:border-esmeralda-500/60' : ''} ${destaque ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><I size={16} />{rotulo}</div>
      <p className={`mt-2 text-2xl font-semibold ${destaque ? 'text-red-600' : cor}`}>{valor}</p>
    </div>
  );
  return to ? <Link to={to}>{corpo}</Link> : corpo;
}

function Grafico({ meses }) {
  const max = Math.max(1, ...meses.flatMap((m) => [m.receitas, m.despesas]));
  const nome = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-esmeralda-500" />Receitas recebidas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-marinho-400" />Despesas pagas</span>
      </div>
      <div className="flex h-48 items-end gap-2 sm:gap-4" role="img" aria-label="Gráfico de receitas e despesas dos últimos 6 meses">
        {meses.map((m) => (
          <div key={m.mes} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div className="group relative w-1/2 max-w-7 rounded-t bg-esmeralda-500" style={{ height: `${(m.receitas / max) * 100}%`, minHeight: m.receitas ? 3 : 0 }}>
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-marinho-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{moeda(m.receitas)}</span>
              </div>
              <div className="group relative w-1/2 max-w-7 rounded-t bg-marinho-400" style={{ height: `${(m.despesas / max) * 100}%`, minHeight: m.despesas ? 3 : 0 }}>
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-marinho-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{moeda(m.despesas)}</span>
              </div>
            </div>
            <span className="text-xs capitalize text-slate-500">{nome(m.mes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Painel() {
  const { usuario, ehAdmin } = useSessao();
  const { dados: d, carregando } = useCarregar(() => api.get('/api/painel'), []);
  if (carregando || !d) return <Carregando />;
  const primeiroNome = usuario.nome.split(' ')[0];
  const semNada = d.processosAtivos === 0 && d.clientes === 0;
  return (
    <>
      <Cabecalho titulo={`Olá, ${primeiroNome}`} subtitulo={dataLonga(d.hoje)} />
      {semNada && (
        <div className="cartao mb-6 flex flex-col gap-3 border-esmeralda-500/40 bg-esmeralda-50 p-5 dark:bg-esmeralda-500/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-marinho-700 dark:text-white">Seu escritório ainda está vazio.</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Cadastre o primeiro cliente{ehAdmin ? ' ou carregue dados de demonstração para conhecer o sistema' : ''}.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/app/clientes?novo=1" className="btn-primario">Novo cliente</Link>
            {ehAdmin && <Link to="/app/configuracoes?aba=demo" className="btn-claro">Dados de demonstração</Link>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicador icone={Scale} rotulo="Processos ativos" valor={d.processosAtivos} to="/app/processos" />
        <Indicador icone={Users} rotulo="Clientes" valor={d.clientes} to="/app/clientes" />
        <Indicador icone={AlarmClock} rotulo="Prazos hoje" valor={d.prazosHoje} cor="text-orange-600" to="/app/prazos?situacao=hoje" />
        <Indicador icone={Clock} rotulo="Próximos 7 dias" valor={d.prazos7} to="/app/prazos" />
        <Indicador icone={AlertTriangle} rotulo="Prazos atrasados" valor={d.prazosAtrasados} destaque={d.prazosAtrasados > 0} to="/app/prazos?situacao=atrasados" />
        <Indicador icone={CalendarDays} rotulo="Compromissos hoje" valor={d.compromissosHoje.length} to="/app/agenda" />
      </div>
      {d.financeiro && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Indicador icone={TrendingUp} rotulo="Recebido no mês" valor={moeda(d.financeiro.recebidoMes)} cor="text-esmeralda-600" to="/app/financeiro" />
          <Indicador icone={Wallet} rotulo="A receber" valor={moeda(d.financeiro.aReceber)} to="/app/financeiro?status=Pendente" />
          <Indicador icone={AlertTriangle} rotulo="Recebimentos em atraso" valor={moeda(d.financeiro.emAtraso)} destaque={d.financeiro.emAtraso > 0} to="/app/financeiro?status=Atrasado" />
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="cartao lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-marinho-800">
            <h2 className="font-semibold">Meus prazos</h2>
            <Link to="/app/prazos" className="text-sm font-medium text-esmeralda-600">Ver todos</Link>
          </div>
          {!d.meusPrazos.length ? <Vazio titulo="Nenhum prazo pendente com você" icone={AlarmClock} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
              {d.meusPrazos.map((p) => {
                const s = situacaoPrazo(p);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.titulo}</p>
                      <p className="truncate text-xs text-slate-500">{data(p.vencimento)}{p.processo_titulo ? ` · ${p.processo_titulo}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">{p.prioridade === 'Fatal' && <Selo cor="vermelho">Fatal</Selo>}<Selo cor={s.cor}>{s.rotulo}</Selo></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="cartao lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-marinho-800"><h2 className="font-semibold">Compromissos de hoje</h2></div>
          {!d.compromissosHoje.length ? <Vazio titulo="Agenda livre hoje" icone={CalendarDays} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-marinho-800">
              {d.compromissosHoje.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-3">
                  <span className="w-12 shrink-0 font-semibold text-esmeralda-600">{hora(e.inicio) || '—'}</span>
                  <div className="min-w-0"><p className="truncate font-medium">{e.titulo}</p><p className="truncate text-xs text-slate-500">{e.tipo}{e.local ? ` · ${e.local}` : ''}</p></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {d.grafico && (
        <section className="cartao mt-6 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Receitas x despesas — últimos 6 meses</h2>
            <span className="text-xs text-slate-500">Saldo: {moedaCurta(d.grafico.reduce((s, m) => s + m.receitas - m.despesas, 0))}</span>
          </div>
          <Grafico meses={d.grafico} />
        </section>
      )}
    </>
  );
}
