import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { SessaoProvider, useSessao } from './lib/sessao.jsx';
import { AvisoProvider, Carregando } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { Inicio, Acesso } from './pages/Inicio.jsx';
import Painel from './pages/Painel.jsx';
import { ListaClientes, DetalheCliente } from './pages/Clientes.jsx';
import { ListaProcessos, DetalheProcesso } from './pages/Processos.jsx';
import Kanban from './pages/Kanban.jsx';
import Prazos from './pages/Prazos.jsx';
import Agenda from './pages/Agenda.jsx';
import Financeiro from './pages/Financeiro.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Mensagens from './pages/Mensagens.jsx';
import { PortalProvider, PortalEntrar, PortalAtivar, PortalLayout, PortalInicio, PortalProcesso, PortalMensagens, PortalPagamentos } from './pages/Portal.jsx';

function Protegido({ children }) {
  const { carregando, usuario } = useSessao();
  if (carregando) return <Carregando />;
  return usuario ? children : <Navigate to="/entrar" replace />;
}
function SoFinanceiro({ children }) {
  const { veFinanceiro } = useSessao();
  return veFinanceiro ? children : <Navigate to="/app" replace />;
}

function App() {
  const { carregando } = useSessao();
  if (carregando) return <Carregando />;
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/entrar" element={<Acesso modo="entrar" />} />
      <Route path="/cadastro" element={<Acesso modo="cadastro" />} />
      <Route path="/app" element={<Protegido><Layout /></Protegido>}>
        <Route index element={<Painel />} />
        <Route path="clientes" element={<ListaClientes />} />
        <Route path="clientes/:id" element={<DetalheCliente />} />
        <Route path="processos" element={<ListaProcessos />} />
        <Route path="processos/:id" element={<DetalheProcesso />} />
        <Route path="kanban" element={<Kanban />} />
        <Route path="prazos" element={<Prazos />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="financeiro" element={<SoFinanceiro><Financeiro /></SoFinanceiro>} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="mensagens" element={<Mensagens />} />
        <Route path="mensagens/:clienteId" element={<Mensagens />} />
      </Route>
      <Route path="/portal/entrar" element={<PortalEntrar />} />
      <Route path="/portal/ativar/:token" element={<PortalAtivar />} />
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<PortalInicio />} />
        <Route path="processos/:id" element={<PortalProcesso />} />
        <Route path="mensagens" element={<PortalMensagens />} />
        <Route path="pagamentos" element={<PortalPagamentos />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessaoProvider>
        <PortalProvider>
          <AvisoProvider>
            <App />
          </AvisoProvider>
        </PortalProvider>
      </SessaoProvider>
    </BrowserRouter>
  </StrictMode>,
);
