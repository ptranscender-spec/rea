import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { utcParaLocal } from '../lib/format.js';

/** Lista de mensagens + campo de envio. `meu` diz qual autor aparece à direita. */
export default function Conversa({ itens, meu, onEnviar, vazio = 'Nenhuma mensagem ainda.', placeholder = 'Escreva uma mensagem…', altura = 'h-[60vh]' }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);
  const qtd = itens?.length || 0;
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [qtd]);
  const enviar = async (e) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try { await onEnviar(t); setTexto(''); } finally { setEnviando(false); }
  };
  return (
    <div className={`flex ${altura} min-h-80 flex-col`}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {!qtd && <p className="py-10 text-center text-sm text-slate-500">{vazio}</p>}
        {itens?.map((m) => {
          const minha = m.autor === meu;
          return (
            <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${minha ? 'rounded-br-sm bg-marinho-700 text-white' : 'rounded-bl-sm bg-white text-slate-800 dark:bg-marinho-800 dark:text-slate-100'}`}>
                {m.autor === 'escritorio' && m.usuario_nome && !minha && <p className="mb-0.5 text-xs font-semibold text-esmeralda-600">{m.usuario_nome}</p>}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className={`mt-1 text-right text-[10px] ${minha ? 'text-marinho-200' : 'text-slate-400'}`}>
                  {m.autor === 'escritorio' && minha && m.usuario_nome ? `${m.usuario_nome} · ` : ''}{utcParaLocal(m.criado_em)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <form onSubmit={enviar} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-marinho-800">
        <textarea rows={1} className="campo max-h-32 min-h-[42px] resize-none" placeholder={placeholder} value={texto} aria-label="Mensagem"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <button className="btn-primario h-[42px] px-3" disabled={!texto.trim() || enviando} aria-label="Enviar"><Send size={18} /></button>
      </form>
    </div>
  );
}

/** Repete `fn` a cada `ms` enquanto a aba estiver visível. */
export function useRepetir(fn, ms, deps) {
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') fn(); }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
