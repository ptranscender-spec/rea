import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useSessao = () => useContext(Ctx);

export function SessaoProvider({ children }) {
  const [estado, setEstado] = useState({ carregando: true, usuario: null, escritorio: null });
  const [equipe, setEquipe] = useState([]);

  const atualizar = useCallback(async () => {
    const r = await api.get('/api/auth/eu');
    setEstado({ carregando: false, usuario: r.usuario, escritorio: r.escritorio || null });
    if (r.usuario) setEquipe(await api.get('/api/equipe'));
    else setEquipe([]);
    return r;
  }, []);

  useEffect(() => {
    atualizar().catch(() => setEstado({ carregando: false, usuario: null, escritorio: null }));
    const expirou = () => setEstado({ carregando: false, usuario: null, escritorio: null });
    window.addEventListener('jn-sessao-expirada', expirou);
    return () => window.removeEventListener('jn-sessao-expirada', expirou);
  }, [atualizar]);

  const sair = async () => { await api.post('/api/auth/sair'); setEstado({ carregando: false, usuario: null, escritorio: null }); };
  const u = estado.usuario;
  const valor = {
    ...estado, equipe, atualizar, sair,
    ehAdmin: u?.papel === 'admin',
    veFinanceiro: !!u && u.papel !== 'estagiario',
    equipeAtiva: equipe.filter((m) => m.ativo),
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
