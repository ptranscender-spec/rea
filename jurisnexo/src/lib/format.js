export const AREAS = ['Cível', 'Trabalhista', 'Família', 'Previdenciário', 'Criminal', 'Tributário', 'Consumidor', 'Empresarial', 'Outros'];
export const FASES = ['Consultivo', 'Inicial', 'Instrução', 'Sentença', 'Recurso', 'Execução', 'Arquivado'];
export const STATUS_PROC = ['Ativo', 'Suspenso', 'Encerrado'];
export const TIPOS_PRAZO = ['Prazo processual', 'Audiência', 'Tarefa interna', 'Reunião'];
export const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Fatal'];
export const TIPOS_EVENTO = ['Audiência', 'Reunião', 'Compromisso', 'Prazo processual'];
export const CAT_RECEITA = ['Honorários contratuais', 'Honorários de êxito', 'Consultas', 'Reembolso', 'Outras receitas'];
export const CAT_DESPESA = ['Custas processuais', 'Despesas do escritório', 'Impostos', 'Salários e encargos', 'Outras despesas'];
export const FORMAS_PAG = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'];
export const CATS_DOC = ['Petição', 'Procuração', 'Contrato', 'Documento pessoal', 'Decisão', 'Comprovante', 'Outros'];
export const PAPEIS = { admin: 'Administrador', advogado: 'Advogado', estagiario: 'Estagiário/Assistente' };
export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (v) => brl.format(Number(v) || 0);
export const moedaCurta = (v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(Number(v) || 0);

export const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dataDe = (s) => { const [a, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
export const data = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
export const hora = (s) => (s && s.length > 10 ? s.slice(11, 16) : '');
export const dataHora = (s) => (s ? `${data(s)}${hora(s) ? ' ' + hora(s) : ''}` : '—');
export const inicial = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
export const dataLonga = (s) => inicial(dataDe(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
export const mesNome = (a, m) => inicial(new Date(a, m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
export const utcParaLocal = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function diasAte(s) {
  return Math.round((dataDe(s) - dataDe(hojeIso())) / 864e5);
}
export function situacaoPrazo(p) {
  if (p.status !== 'Pendente') return { rotulo: p.status, cor: p.status === 'Concluído' ? 'verde' : 'cinza' };
  const d = diasAte(p.vencimento);
  if (d < 0) return { rotulo: `Atrasado ${-d} dia${d === -1 ? '' : 's'}`, cor: 'vermelho' };
  if (d === 0) return { rotulo: 'Vence hoje', cor: 'laranja' };
  if (d === 1) return { rotulo: 'Vence amanhã', cor: 'amarelo' };
  return { rotulo: `Em ${d} dias`, cor: 'azul' };
}

// ----- Máscaras -----
const dig = (s) => String(s || '').replace(/\D/g, '');
const aplicar = (v, molde) => {
  const d = dig(v); let out = '', i = 0;
  for (const c of molde) { if (i >= d.length) break; if (c === '#') out += d[i++]; else out += c; }
  return out;
};
export const mascaraCPF = (v) => aplicar(v, '###.###.###-##');
export const mascaraCNPJ = (v) => aplicar(v, '##.###.###/####-##');
export const mascaraCEP = (v) => aplicar(v, '#####-###');
export const mascaraCNJ = (v) => aplicar(v, '#######-##.####.#.##.####');
export const mascaraTel = (v) => (dig(v).length > 10 ? aplicar(v, '(##) #####-####') : aplicar(v, '(##) ####-####'));

export function cpfValido(v) {
  const c = dig(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
export function cnpjValido(v) {
  const c = dig(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n) => {
    const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = p.reduce((s, x, i) => s + Number(c[i]) * x, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export function baixarArquivo(url) {
  const a = document.createElement('a');
  a.href = url; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
