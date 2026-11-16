import crypto from 'node:crypto';

// ---------- Senhas ----------
export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}
export function conferirSenha(senha, armazenado) {
  if (!armazenado) return false;
  const [alg, salHex, hHex] = armazenado.split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hHex, 'hex'));
}

// ---------- CPF / CNPJ ----------
const digitos = (s) => String(s || '').replace(/\D/g, '');
export function cpfValido(v) {
  const c = digitos(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const d = ((soma * 10) % 11) % 10;
    if (d !== Number(c[t])) return false;
  }
  return true;
}
export function cnpjValido(v) {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(c[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

// ---------- Número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) ----------
export function cnjValido(v) {
  const c = digitos(v);
  if (c.length !== 20) return false;
  const n = c.slice(0, 7), dd = c.slice(7, 9), resto = c.slice(9); // AAAA J TR OOOO
  const base = BigInt(n + resto + '00');
  const dv = 98n - (base % 97n);
  return Number(dv) === Number(dd);
}

// ---------- Datas e dias úteis ----------
export const iso = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const deIso = (s) => {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
};
export function hojeSP() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return p; // YYYY-MM-DD
}

/**
 * Conta prazo em dias úteis (art. 219 do CPC): exclui o dia do início
 * e conta a partir do primeiro dia útil seguinte; pula sábados, domingos e feriados.
 */
export function calcularPrazo(dataInicio, dias, feriados = new Set()) {
  const util = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !feriados.has(iso(d));
  const d = deIso(dataInicio);
  let contados = 0;
  const pulados = [];
  while (contados < dias) {
    d.setDate(d.getDate() + 1);
    if (util(d)) contados++;
    else pulados.push(iso(d));
  }
  return { vencimento: iso(d), pulados };
}

// Páscoa (algoritmo de Meeus) para feriados móveis
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
export function feriadosNacionais(ano) {
  const p = pascoa(ano);
  const rel = (dias) => { const d = new Date(p); d.setDate(d.getDate() + dias); return iso(d); };
  return [
    [`${ano}-01-01`, 'Confraternização Universal'],
    [rel(-48), 'Carnaval (segunda-feira)'],
    [rel(-47), 'Carnaval (terça-feira)'],
    [rel(-2), 'Sexta-feira Santa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [rel(60), 'Corpus Christi'],
    [`${ano}-09-07`, 'Independência do Brasil'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra'],
    [`${ano}-12-25`, 'Natal'],
  ];
}

export const novoToken = () => crypto.randomBytes(32).toString('hex');
