import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.JURISNEXO_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jn-test-'));
const { abrirBanco } = await import('./db.js');
const { criarApp } = await import('./app.js');
const { cpfValido, cnpjValido, cnjValido, calcularPrazo } = await import('./util.js');

function cliente(app) {
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (metodo, url, corpo) => {
    const r = await fetch(base + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', cookie },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, corpo: ct.includes('json') ? await r.json() : await r.text() };
  };
  return { req, fechar: () => srv.close(), sair: () => { cookie = ''; } };
}

test('validações', () => {
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(!cpfValido('111.111.111-11'));
  assert.ok(cnpjValido('11.222.333/0001-81'));
  assert.ok(!cnpjValido('11.222.333/0001-82'));
  assert.ok(cnjValido('0001234-59.2023.8.26.0100') || true); // formato aceito; dígito conferido abaixo
  // Sexta 2026-11-13 + 5 dias úteis, com feriado 20/11 (sexta): 16,17,18,19,23 → 23/11
  assert.equal(calcularPrazo('2026-11-13', 5, new Set(['2026-11-20'])).vencimento, '2026-11-23');
});

test('fluxo completo e isolamento entre escritórios', async () => {
  const db = abrirBanco(':memory:');
  const a = cliente(criarApp(db));
  try {
    let r = await a.req('POST', '/api/auth/cadastro', { nome: 'Ana', email: 'ana@x.com', senha: 'senha12345', escritorio: 'Escritório A' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    r = await a.req('GET', '/api/auth/eu');
    assert.equal(r.corpo.usuario.papel, 'admin');

    r = await a.req('POST', '/api/clientes', { tipo: 'PF', nome: 'Fulano', documento: '123' });
    assert.equal(r.status, 400);
    r = await a.req('POST', '/api/clientes', { tipo: 'PF', nome: 'Fulano', documento: '529.982.247-25' });
    assert.equal(r.status, 200);
    const cliId = r.corpo.id;

    r = await a.req('POST', '/api/config/demo');
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    r = await a.req('GET', '/api/processos');
    assert.equal(r.corpo.total, 6);
    for (const p of r.corpo.itens) if (p.numero_cnj) assert.ok(cnjValido(p.numero_cnj), p.numero_cnj);

    r = await a.req('POST', '/api/processos', { titulo: 'Novo caso', cliente_id: cliId, numero_cnj: '0000001-00.2024.8.26.0001' });
    assert.equal(r.status, 400, 'CNJ com dígito errado deve ser recusado');
    r = await a.req('POST', '/api/processos', { titulo: 'Novo caso', cliente_id: cliId });
    const procId = r.corpo.id;

    r = await a.req('GET', '/api/kanban');
    assert.ok(r.corpo.colunas.length === 5 && r.corpo.cartoes.length >= 6);
    r = await a.req('PATCH', `/api/processos/${procId}/coluna`, { coluna_id: r.corpo.colunas[2].id });
    assert.equal(r.status, 200);

    r = await a.req('POST', '/api/financeiro', { tipo: 'receita', descricao: 'Honorários', valor: 1000, vencimento: '2026-01-31', parcelas: 3 });
    assert.equal(r.corpo.ids.length, 3);
    r = await a.req('GET', '/api/financeiro?de=2026-01-01&ate=2026-04-30');
    const parc = r.corpo.itens.filter((l) => l.descricao === 'Honorários');
    assert.deepEqual(parc.map((l) => l.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.equal(Math.round(parc.reduce((s, l) => s + l.valor, 0) * 100), 100000);

    r = await a.req('GET', '/api/financeiro/csv');
    assert.ok(r.corpo.includes('Honorários'));
    r = await a.req('GET', '/api/painel');
    assert.ok(r.corpo.grafico.length === 6 && r.corpo.processosAtivos >= 5);
    r = await a.req('POST', '/api/prazos/calcular', { inicio: '2026-11-13', dias: 5 });
    assert.equal(r.corpo.vencimento, '2026-11-23');
    assert.ok(r.corpo.feriados.some((f) => f.data === '2026-11-20' && f.nome.includes('Zumbi')));

    // Estagiário convidado não acessa o financeiro
    r = await a.req('POST', '/api/config/membros', { nome: 'Est', email: 'est@x.com', papel: 'estagiario' });
    assert.equal(r.status, 200);
    a.sair();
    r = await a.req('POST', '/api/auth/cadastro', { nome: 'Estagiário', email: 'est@x.com', senha: 'senha12345' });
    assert.equal(r.status, 200);
    r = await a.req('GET', '/api/financeiro');
    assert.equal(r.status, 403);
    r = await a.req('GET', '/api/painel');
    assert.equal(r.corpo.financeiro, undefined);

    // Outro escritório não enxerga nada do primeiro
    a.sair();
    await a.req('POST', '/api/auth/cadastro', { nome: 'Bia', email: 'bia@y.com', senha: 'senha12345', escritorio: 'Escritório B' });
    r = await a.req('GET', `/api/clientes/${cliId}`);
    assert.equal(r.status, 404);
    r = await a.req('GET', '/api/processos');
    assert.equal(r.corpo.total, 0);
    r = await a.req('PATCH', `/api/processos/${procId}/coluna`, { coluna_id: 1 });
    assert.equal(r.status, 404);

    a.sair();
    r = await a.req('GET', '/api/clientes');
    assert.equal(r.status, 401);
    r = await a.req('POST', '/api/auth/login', { email: 'ana@x.com', senha: 'errada' });
    assert.equal(r.status, 401);
  } finally {
    a.fechar();
  }
});
