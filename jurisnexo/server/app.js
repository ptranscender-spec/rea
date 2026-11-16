import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import {
  hashSenha, conferirSenha, cpfValido, cnpjValido, cnjValido,
  calcularPrazo, feriadosNacionais, hojeSP, novoToken, iso, deIso,
} from './util.js';
import { carregarDemo } from './demo.js';
import { rotasPortal } from './portal.js';

const DIAS_SESSAO = 14;
const COLUNAS_PADRAO = ['Novo', 'Em andamento', 'Aguardando cliente', 'Aguardando tribunal', 'Concluído'];

class ErroHttp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const erro = (status, msg) => { throw new ErroHttp(status, msg); };
const limpar = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const numero = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const so = (s) => String(s || '').replace(/\D/g, '');

export function criarApp(db) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const q = (sql) => db.prepare(sql);
  const auditar = (req, entidade, id, acao, detalhes) =>
    q('INSERT INTO auditoria (escritorio_id, usuario_id, entidade, entidade_id, acao, detalhes) VALUES (?,?,?,?,?,?)')
      .run(req.u.escritorio_id, req.u.id, entidade, id, acao, detalhes ? JSON.stringify(detalhes) : null);

  // ---------- Sessão ----------
  const lerCookie = (req, nome) => {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(nome + '='));
    return m ? decodeURIComponent(m.slice(nome.length + 1)) : null;
  };
  const abrirSessao = (res, usuarioId) => {
    const token = novoToken();
    const expira = new Date(Date.now() + DIAS_SESSAO * 864e5);
    q('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)').run(token, usuarioId, expira.toISOString());
    res.setHeader('Set-Cookie', `jn_sessao=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS_SESSAO * 86400}`);
  };
  app.use((req, _res, next) => {
    const token = lerCookie(req, 'jn_sessao');
    if (token) {
      const u = q(`SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
                   WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1`).get(token, new Date().toISOString());
      if (u) { req.u = u; req.token = token; }
    }
    next();
  });
  const logado = (req, _res, next) => (req.u && req.u.escritorio_id ? next() : next(new ErroHttp(401, 'Faça login para continuar.')));
  const admin = (req, _res, next) => (req.u.papel === 'admin' ? next() : next(new ErroHttp(403, 'Apenas administradores podem fazer isso.')));
  const financeiro = (req, _res, next) => (req.u.papel !== 'estagiario' ? next() : next(new ErroHttp(403, 'Seu papel não tem acesso ao Financeiro.')));
  const r = (fn) => (req, res, next) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { next(e); } };
  const E = (req) => req.u.escritorio_id;
  const doEscritorio = (tabela, id, req) => {
    const row = q(`SELECT * FROM ${tabela} WHERE id = ? AND escritorio_id = ?`).get(Number(id), E(req));
    if (!row) erro(404, 'Registro não encontrado.');
    return row;
  };
  const publico = (u) => u && { id: u.id, nome: u.nome, email: u.email, papel: u.papel, escritorio_id: u.escritorio_id, ativo: u.ativo, pendente: !u.senha_hash };

  // ---------- Autenticação ----------
  app.post('/api/auth/cadastro', r((req, res) => {
    const nome = limpar(req.body.nome), email = limpar(req.body.email)?.toLowerCase(), senha = req.body.senha || '';
    if (!nome || !email || !/^\S+@\S+\.\S+$/.test(email)) erro(400, 'Informe nome e um e-mail válido.');
    if (senha.length < 8) erro(400, 'A senha precisa ter pelo menos 8 caracteres.');
    const existente = q('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (existente && existente.senha_hash) erro(409, 'Já existe uma conta com este e-mail. Use "Entrar".');
    let usuarioId;
    if (existente) {
      // Convite pendente: a pessoa entra no escritório que a convidou.
      q('UPDATE usuarios SET nome = ?, senha_hash = ? WHERE id = ?').run(nome, hashSenha(senha), existente.id);
      usuarioId = existente.id;
    } else {
      const nomeEsc = limpar(req.body.escritorio);
      if (!nomeEsc) erro(400, 'Informe o nome do escritório.');
      db.exec('BEGIN');
      try {
        const esc = q('INSERT INTO escritorios (nome, email, oab) VALUES (?,?,?)').run(nomeEsc, email, limpar(req.body.oab));
        const escId = Number(esc.lastInsertRowid);
        usuarioId = Number(q("INSERT INTO usuarios (escritorio_id, nome, email, senha_hash, papel) VALUES (?,?,?,?, 'admin')")
          .run(escId, nome, email, hashSenha(senha)).lastInsertRowid);
        COLUNAS_PADRAO.forEach((c, i) => q('INSERT INTO kanban_colunas (escritorio_id, nome, ordem) VALUES (?,?,?)').run(escId, c, i));
        const ano = Number(hojeSP().slice(0, 4));
        for (const a of [ano, ano + 1]) for (const [data, n] of feriadosNacionais(a))
          q('INSERT OR IGNORE INTO feriados (escritorio_id, data, nome) VALUES (?,?,?)').run(escId, data, n);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    abrirSessao(res, usuarioId);
    return { usuario: publico(q('SELECT * FROM usuarios WHERE id = ?').get(usuarioId)) };
  }));

  app.post('/api/auth/login', r((req, res) => {
    const u = q('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(String(req.body.email || '').trim().toLowerCase());
    if (!u || !conferirSenha(String(req.body.senha || ''), u.senha_hash)) erro(401, 'E-mail ou senha incorretos.');
    abrirSessao(res, u.id);
    return { usuario: publico(u) };
  }));

  app.post('/api/auth/sair', r((req, res) => {
    if (req.token) q('DELETE FROM sessoes WHERE token = ?').run(req.token);
    res.setHeader('Set-Cookie', 'jn_sessao=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  }));

  app.get('/api/auth/eu', r((req) => {
    if (!req.u) return { usuario: null };
    const esc = q('SELECT * FROM escritorios WHERE id = ?').get(req.u.escritorio_id);
    return { usuario: publico(req.u), escritorio: esc };
  }));

  app.use('/api/portal', rotasPortal(db));
  app.use('/api', logado);

  // ---------- Equipe ----------
  app.get('/api/equipe', r((req) => q('SELECT id, nome, email, papel, ativo, senha_hash IS NULL AS pendente FROM usuarios WHERE escritorio_id = ? ORDER BY nome').all(E(req))));

  app.get('/api/opcoes/processos', r((req) => q("SELECT id, titulo, numero_cnj, cliente_id FROM processos WHERE escritorio_id = ? ORDER BY status = 'Encerrado', titulo").all(E(req))));
  app.get('/api/opcoes/clientes', r((req) => q('SELECT id, nome, documento FROM clientes WHERE escritorio_id = ? ORDER BY nome').all(E(req))));

  // ---------- Painel ----------
  app.get('/api/painel', r((req) => {
    const hoje = hojeSP();
    const em7 = iso(new Date(deIso(hoje).getTime() + 7 * 864e5));
    const e = E(req);
    const um = (sql, ...p) => Object.values(q(sql).get(...p))[0];
    const dados = {
      processosAtivos: um("SELECT COUNT(*) FROM processos WHERE escritorio_id = ? AND status = 'Ativo'", e),
      clientes: um('SELECT COUNT(*) FROM clientes WHERE escritorio_id = ?', e),
      prazosHoje: um("SELECT COUNT(*) FROM prazos WHERE escritorio_id = ? AND status = 'Pendente' AND substr(vencimento,1,10) = ?", e, hoje),
      prazos7: um("SELECT COUNT(*) FROM prazos WHERE escritorio_id = ? AND status = 'Pendente' AND substr(vencimento,1,10) > ? AND substr(vencimento,1,10) <= ?", e, hoje, em7),
      prazosAtrasados: um("SELECT COUNT(*) FROM prazos WHERE escritorio_id = ? AND status = 'Pendente' AND substr(vencimento,1,10) < ?", e, hoje),
      compromissosHoje: q(`SELECT ev.*, p.titulo AS processo_titulo FROM eventos ev LEFT JOIN processos p ON p.id = ev.processo_id
                           WHERE ev.escritorio_id = ? AND substr(ev.inicio,1,10) = ? ORDER BY ev.inicio`).all(e, hoje),
      meusPrazos: q(`SELECT pz.*, p.titulo AS processo_titulo FROM prazos pz LEFT JOIN processos p ON p.id = pz.processo_id
                     WHERE pz.escritorio_id = ? AND pz.responsavel_id = ? AND pz.status = 'Pendente'
                     ORDER BY pz.vencimento LIMIT 8`).all(e, req.u.id),
      hoje,
    };
    if (req.u.papel !== 'estagiario') {
      const mes = hoje.slice(0, 7);
      dados.financeiro = {
        recebidoMes: um("SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE escritorio_id = ? AND tipo='receita' AND pago_em IS NOT NULL AND substr(pago_em,1,7) = ?", e, mes),
        aReceber: um("SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE escritorio_id = ? AND tipo='receita' AND pago_em IS NULL AND vencimento >= ?", e, hoje),
        emAtraso: um("SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE escritorio_id = ? AND tipo='receita' AND pago_em IS NULL AND vencimento < ?", e, hoje),
      };
      const meses = [];
      const base = deIso(hoje);
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const m = iso(d).slice(0, 7);
        meses.push({
          mes: m,
          receitas: um("SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE escritorio_id = ? AND tipo='receita' AND pago_em IS NOT NULL AND substr(pago_em,1,7) = ?", e, m),
          despesas: um("SELECT COALESCE(SUM(valor),0) FROM lancamentos WHERE escritorio_id = ? AND tipo='despesa' AND pago_em IS NOT NULL AND substr(pago_em,1,7) = ?", e, m),
        });
      }
      dados.grafico = meses;
    }
    return dados;
  }));

  // ---------- Busca e notificações ----------
  app.get('/api/busca', r((req) => {
    const termo = String(req.query.q || '').trim();
    if (termo.length < 2) return { clientes: [], processos: [] };
    const like = `%${termo}%`, dig = so(termo);
    return {
      clientes: q('SELECT id, nome, documento, tipo FROM clientes WHERE escritorio_id = ? AND (nome LIKE ? OR (? <> \'\' AND replace(replace(replace(replace(documento,\'.\',\'\'),\'-\',\'\'),\'/\',\'\'),\' \',\'\') LIKE ?)) ORDER BY nome LIMIT 6')
        .all(E(req), like, dig, `%${dig}%`),
      processos: q("SELECT id, titulo, numero_cnj FROM processos WHERE escritorio_id = ? AND (titulo LIKE ? OR (? <> '' AND replace(replace(numero_cnj,'.',''),'-','') LIKE ?)) ORDER BY titulo LIMIT 6")
        .all(E(req), like, dig, `%${dig}%`),
    };
  }));

  app.get('/api/notificacoes', r((req) => {
    const hoje = hojeSP();
    const limite = iso(new Date(deIso(hoje).getTime() + 2 * 864e5));
    return q(`SELECT pz.id, pz.titulo, pz.vencimento, pz.prioridade, p.titulo AS processo_titulo,
                     CASE WHEN substr(pz.vencimento,1,10) < ? THEN 'atrasado' ELSE 'proximo' END AS situacao
              FROM prazos pz LEFT JOIN processos p ON p.id = pz.processo_id
              WHERE pz.escritorio_id = ? AND pz.status = 'Pendente' AND pz.responsavel_id = ? AND substr(pz.vencimento,1,10) <= ?
              ORDER BY pz.vencimento`).all(hoje, E(req), req.u.id, limite);
  }));

  // ---------- Clientes ----------
  const dadosCliente = (b) => {
    const tipo = b.tipo === 'PJ' ? 'PJ' : 'PF';
    const nome = limpar(b.nome);
    if (!nome) erro(400, tipo === 'PJ' ? 'Informe a razão social.' : 'Informe o nome do cliente.');
    const doc = limpar(b.documento);
    if (doc && tipo === 'PF' && !cpfValido(doc)) erro(400, 'CPF inválido. Confira os números.');
    if (doc && tipo === 'PJ' && !cnpjValido(doc)) erro(400, 'CNPJ inválido. Confira os números.');
    const email = limpar(b.email);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) erro(400, 'E-mail inválido.');
    return [tipo, nome, doc, limpar(b.rg), limpar(b.nascimento), limpar(b.telefone), limpar(b.whatsapp), email,
      limpar(b.cep), limpar(b.logradouro), limpar(b.numero), limpar(b.complemento), limpar(b.bairro), limpar(b.cidade), limpar(b.uf)?.toUpperCase() ?? null, limpar(b.observacoes)];
  };
  const semSegredos = (c) => { if (c) { c.portal_pendente = !!c.portal_token && !c.portal_ativo; delete c.portal_senha_hash; delete c.portal_token; } return c; };
  const CAMPOS_CLI = 'tipo, nome, documento, rg, nascimento, telefone, whatsapp, email, cep, logradouro, numero, complemento, bairro, cidade, uf, observacoes';

  app.get('/api/clientes', r((req) => {
    const pagina = Math.max(1, Number(req.query.pagina) || 1), por = 15;
    const conds = ['escritorio_id = ?'], p = [E(req)];
    if (req.query.q) { conds.push('(nome LIKE ? OR documento LIKE ? OR email LIKE ?)'); const l = `%${req.query.q}%`; p.push(l, l, l); }
    if (req.query.tipo === 'PF' || req.query.tipo === 'PJ') { conds.push('tipo = ?'); p.push(req.query.tipo); }
    const ordem = { nome: 'nome', recentes: 'criado_em DESC' }[req.query.ordem] || 'nome';
    const where = conds.join(' AND ');
    const total = q(`SELECT COUNT(*) n FROM clientes WHERE ${where}`).get(...p).n;
    const itens = q(`SELECT c.*, (SELECT COUNT(*) FROM processos WHERE cliente_id = c.id) AS n_processos
                     FROM clientes c WHERE ${where} ORDER BY ${ordem} LIMIT ? OFFSET ?`).all(...p, por, (pagina - 1) * por);
    itens.forEach(semSegredos);
    return { itens, total, pagina, paginas: Math.max(1, Math.ceil(total / por)) };
  }));
  app.get('/api/clientes/:id', r((req) => {
    const c = semSegredos(doEscritorio('clientes', req.params.id, req));
    c.processos = q('SELECT id, titulo, numero_cnj, status, area FROM processos WHERE cliente_id = ? ORDER BY criado_em DESC').all(c.id);
    c.eventos = q('SELECT * FROM eventos WHERE cliente_id = ? ORDER BY inicio DESC LIMIT 20').all(c.id);
    if (req.u.papel !== 'estagiario') c.lancamentos = q('SELECT * FROM lancamentos WHERE cliente_id = ? ORDER BY vencimento DESC').all(c.id);
    return c;
  }));
  app.post('/api/clientes', r((req) => {
    const v = dadosCliente(req.body);
    const id = Number(q(`INSERT INTO clientes (escritorio_id, ${CAMPOS_CLI}) VALUES (?${',?'.repeat(16)})`).run(E(req), ...v).lastInsertRowid);
    auditar(req, 'cliente', id, 'criou');
    return { id };
  }));
  app.put('/api/clientes/:id', r((req) => {
    const c = doEscritorio('clientes', req.params.id, req);
    const v = dadosCliente(req.body);
    q(`UPDATE clientes SET ${CAMPOS_CLI.split(', ').map((k) => k + ' = ?').join(', ')} WHERE id = ?`).run(...v, c.id);
    auditar(req, 'cliente', c.id, 'alterou');
    return { id: c.id };
  }));
  app.delete('/api/clientes/:id', r((req) => {
    const c = doEscritorio('clientes', req.params.id, req);
    q('DELETE FROM clientes WHERE id = ?').run(c.id);
    auditar(req, 'cliente', c.id, 'excluiu', { nome: c.nome });
    return { ok: true };
  }));

  app.post('/api/clientes/:id/portal', r((req) => {
    const c = doEscritorio('clientes', req.params.id, req);
    if (!c.email) erro(400, 'Cadastre o e-mail do cliente antes de liberar o portal. Ele será usado para entrar.');
    const token = novoToken().slice(0, 32);
    q('UPDATE clientes SET portal_token = ? WHERE id = ?').run(token, c.id);
    auditar(req, 'cliente', c.id, 'gerou link do portal');
    return { token };
  }));
  app.delete('/api/clientes/:id/portal', r((req) => {
    const c = doEscritorio('clientes', req.params.id, req);
    q('UPDATE clientes SET portal_ativo = 0, portal_token = NULL, portal_senha_hash = NULL WHERE id = ?').run(c.id);
    q('DELETE FROM sessoes_portal WHERE cliente_id = ?').run(c.id);
    auditar(req, 'cliente', c.id, 'desativou o portal');
    return { ok: true };
  }));

  // ---------- Mensagens com clientes ----------
  app.get('/api/mensagens', r((req) => q(`SELECT c.id AS cliente_id, c.nome, c.portal_ativo,
        (SELECT texto FROM mensagens WHERE cliente_id = c.id ORDER BY id DESC LIMIT 1) AS ultima,
        (SELECT autor FROM mensagens WHERE cliente_id = c.id ORDER BY id DESC LIMIT 1) AS ultimo_autor,
        (SELECT MAX(criado_em) FROM mensagens WHERE cliente_id = c.id) AS quando,
        (SELECT COUNT(*) FROM mensagens WHERE cliente_id = c.id AND autor = 'cliente' AND lida = 0) AS nao_lidas
      FROM clientes c WHERE c.escritorio_id = ? AND (c.portal_ativo = 1 OR EXISTS (SELECT 1 FROM mensagens WHERE cliente_id = c.id))
      ORDER BY quando IS NULL, quando DESC, c.nome`).all(E(req))));
  app.get('/api/mensagens/nao-lidas', r((req) => ({ n: q("SELECT COUNT(*) n FROM mensagens WHERE escritorio_id = ? AND autor = 'cliente' AND lida = 0").get(E(req)).n })));
  app.get('/api/mensagens/:clienteId', r((req) => {
    const c = doEscritorio('clientes', req.params.clienteId, req);
    const itens = q(`SELECT m.id, m.autor, m.texto, m.criado_em, m.lida, u.nome AS usuario_nome FROM mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id
                     WHERE m.cliente_id = ? ORDER BY m.id DESC LIMIT 300`).all(c.id).reverse();
    q("UPDATE mensagens SET lida = 1 WHERE cliente_id = ? AND autor = 'cliente' AND lida = 0").run(c.id);
    return { cliente: { id: c.id, nome: c.nome, portal_ativo: c.portal_ativo }, itens };
  }));
  app.post('/api/mensagens/:clienteId', r((req) => {
    const c = doEscritorio('clientes', req.params.clienteId, req);
    const texto = limpar(req.body.texto);
    if (!texto) erro(400, 'Escreva a mensagem.');
    if (texto.length > 4000) erro(400, 'Mensagem muito longa.');
    q("INSERT INTO mensagens (escritorio_id, cliente_id, autor, usuario_id, texto) VALUES (?,?, 'escritorio', ?, ?)").run(E(req), c.id, req.u.id, texto);
    return { ok: true };
  }));

  // ---------- Processos ----------
  const dadosProcesso = (b, req) => {
    const titulo = limpar(b.titulo);
    if (!titulo) erro(400, 'Informe o título do processo/caso.');
    const cnj = limpar(b.numero_cnj);
    if (cnj && !cnjValido(cnj)) erro(400, 'Número CNJ inválido. Use o formato NNNNNNN-DD.AAAA.J.TR.OOOO e confira o dígito verificador.');
    const cliente = numero(b.cliente_id);
    if (cliente) doEscritorio('clientes', cliente, req);
    const resp = numero(b.responsavel_id);
    if (resp && !q('SELECT 1 FROM usuarios WHERE id = ? AND escritorio_id = ?').get(resp, E(req))) erro(400, 'Responsável inválido.');
    const etiquetas = (Array.isArray(b.etiquetas) ? b.etiquetas : String(b.etiquetas || '').split(','))
      .map((t) => t.trim()).filter(Boolean).join(',');
    return {
      numero_cnj: cnj, titulo, cliente_id: cliente, parte_contraria: limpar(b.parte_contraria), area: limpar(b.area) || 'Cível',
      tribunal: limpar(b.tribunal), vara: limpar(b.vara), comarca: limpar(b.comarca), fase: limpar(b.fase) || 'Inicial',
      valor_causa: numero(b.valor_causa), responsavel_id: resp, etiquetas, status: limpar(b.status) || 'Ativo',
    };
  };
  app.get('/api/processos', r((req) => {
    const pagina = Math.max(1, Number(req.query.pagina) || 1), por = 15;
    const conds = ['p.escritorio_id = ?'], prm = [E(req)];
    if (req.query.q) { conds.push('(p.titulo LIKE ? OR p.numero_cnj LIKE ? OR c.nome LIKE ? OR p.parte_contraria LIKE ?)'); const l = `%${req.query.q}%`; prm.push(l, l, l, l); }
    for (const k of ['status', 'area', 'fase']) if (req.query[k]) { conds.push(`p.${k} = ?`); prm.push(req.query[k]); }
    if (req.query.responsavel_id) { conds.push('p.responsavel_id = ?'); prm.push(Number(req.query.responsavel_id)); }
    if (req.query.etiqueta) { conds.push("(',' || p.etiquetas || ',') LIKE ?"); prm.push(`%,${req.query.etiqueta},%`); }
    const ordem = { titulo: 'p.titulo', recentes: 'p.criado_em DESC', valor: 'p.valor_causa DESC' }[req.query.ordem] || 'p.criado_em DESC';
    const from = 'FROM processos p LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN usuarios u ON u.id = p.responsavel_id';
    const where = conds.join(' AND ');
    const total = q(`SELECT COUNT(*) n ${from} WHERE ${where}`).get(...prm).n;
    const itens = q(`SELECT p.*, c.nome AS cliente_nome, u.nome AS responsavel_nome ${from} WHERE ${where} ORDER BY ${ordem} LIMIT ? OFFSET ?`)
      .all(...prm, por, (pagina - 1) * por);
    return { itens, total, pagina, paginas: Math.max(1, Math.ceil(total / por)) };
  }));
  app.get('/api/processos/:id', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    p.cliente = p.cliente_id ? q('SELECT id, nome, tipo, telefone, email FROM clientes WHERE id = ?').get(p.cliente_id) : null;
    p.responsavel = p.responsavel_id ? q('SELECT id, nome FROM usuarios WHERE id = ?').get(p.responsavel_id) : null;
    p.andamentos = q('SELECT a.*, u.nome AS autor FROM andamentos a LEFT JOIN usuarios u ON u.id = a.criado_por WHERE processo_id = ? ORDER BY data DESC, id DESC').all(p.id);
    p.prazos = q('SELECT pz.*, u.nome AS responsavel_nome FROM prazos pz LEFT JOIN usuarios u ON u.id = pz.responsavel_id WHERE processo_id = ? ORDER BY vencimento').all(p.id);
    p.documentos = q('SELECT d.id, d.nome, d.categoria, d.tamanho, d.tipo_mime, d.criado_em, d.compartilhado, d.enviado_por_cliente, u.nome AS enviado_por_nome FROM documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE processo_id = ? ORDER BY d.criado_em DESC').all(p.id);
    if (req.u.papel !== 'estagiario') p.lancamentos = q('SELECT * FROM lancamentos WHERE processo_id = ? ORDER BY vencimento').all(p.id);
    p.historico = q(`SELECT a.acao, a.em, a.detalhes, u.nome AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
                     WHERE a.escritorio_id = ? AND a.entidade = 'processo' AND a.entidade_id = ? ORDER BY a.em DESC LIMIT 30`).all(E(req), p.id);
    return p;
  }));
  app.post('/api/processos', r((req) => {
    const v = dadosProcesso(req.body, req);
    const col = q('SELECT id FROM kanban_colunas WHERE escritorio_id = ? ORDER BY ordem LIMIT 1').get(E(req));
    const ks = Object.keys(v);
    const id = Number(q(`INSERT INTO processos (escritorio_id, ${ks.join(', ')}, coluna_id, criado_por) VALUES (?${',?'.repeat(ks.length)}, ?, ?)`)
      .run(E(req), ...Object.values(v), col?.id ?? null, req.u.id).lastInsertRowid);
    auditar(req, 'processo', id, 'criou');
    return { id };
  }));
  app.put('/api/processos/:id', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    const v = dadosProcesso(req.body, req);
    const mudou = Object.keys(v).filter((k) => String(v[k] ?? '') !== String(p[k] ?? ''));
    q(`UPDATE processos SET ${Object.keys(v).map((k) => k + ' = ?').join(', ')}, alterado_por = ?, alterado_em = datetime('now') WHERE id = ?`)
      .run(...Object.values(v), req.u.id, p.id);
    if (mudou.length) auditar(req, 'processo', p.id, 'alterou', { campos: mudou });
    return { id: p.id };
  }));
  app.patch('/api/processos/:id/anotacoes', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    q("UPDATE processos SET anotacoes = ?, alterado_por = ?, alterado_em = datetime('now') WHERE id = ?").run(String(req.body.anotacoes || ''), req.u.id, p.id);
    return { ok: true };
  }));
  app.patch('/api/processos/:id/coluna', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    const col = doEscritorio('kanban_colunas', req.body.coluna_id, req);
    q("UPDATE processos SET coluna_id = ?, alterado_por = ?, alterado_em = datetime('now') WHERE id = ?").run(col.id, req.u.id, p.id);
    auditar(req, 'processo', p.id, 'moveu no Kanban', { para: col.nome });
    return { ok: true };
  }));
  app.delete('/api/processos/:id', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    for (const d of q('SELECT arquivo FROM documentos WHERE processo_id = ?').all(p.id)) fs.rmSync(path.join(DATA_DIR, 'documentos', d.arquivo), { force: true });
    q('DELETE FROM processos WHERE id = ?').run(p.id);
    auditar(req, 'processo', p.id, 'excluiu', { titulo: p.titulo });
    return { ok: true };
  }));

  app.post('/api/processos/:id/andamentos', r((req) => {
    const p = doEscritorio('processos', req.params.id, req);
    const data = limpar(req.body.data), desc = limpar(req.body.descricao);
    if (!data || !desc) erro(400, 'Informe a data e a descrição do andamento.');
    const visivel = req.body.visivel_cliente === false ? 0 : 1;
    const id = Number(q('INSERT INTO andamentos (processo_id, data, descricao, criado_por, visivel_cliente) VALUES (?,?,?,?,?)').run(p.id, data, desc, req.u.id, visivel).lastInsertRowid);
    auditar(req, 'processo', p.id, 'registrou andamento');
    return { id };
  }));
  app.patch('/api/andamentos/:id', r((req) => {
    const a = q('SELECT a.* FROM andamentos a JOIN processos p ON p.id = a.processo_id WHERE a.id = ? AND p.escritorio_id = ?').get(Number(req.params.id), E(req));
    if (!a) erro(404, 'Andamento não encontrado.');
    q('UPDATE andamentos SET visivel_cliente = ? WHERE id = ?').run(req.body.visivel_cliente ? 1 : 0, a.id);
    return { ok: true };
  }));
  app.delete('/api/andamentos/:id', r((req) => {
    const a = q('SELECT a.* FROM andamentos a JOIN processos p ON p.id = a.processo_id WHERE a.id = ? AND p.escritorio_id = ?').get(Number(req.params.id), E(req));
    if (!a) erro(404, 'Andamento não encontrado.');
    q('DELETE FROM andamentos WHERE id = ?').run(a.id);
    return { ok: true };
  }));

  // Documentos
  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(DATA_DIR, 'documentos'),
      filename: (_req, _f, cb) => cb(null, crypto.randomUUID()),
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  app.post('/api/processos/:id/documentos', upload.single('arquivo'), r((req) => {
    let p;
    try { p = doEscritorio('processos', req.params.id, req); } catch (e) { if (req.file) fs.rmSync(req.file.path, { force: true }); throw e; }
    if (!req.file) erro(400, 'Selecione um arquivo.');
    const nomeOriginal = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const id = Number(q('INSERT INTO documentos (processo_id, nome, categoria, arquivo, tamanho, tipo_mime, enviado_por, compartilhado) VALUES (?,?,?,?,?,?,?,?)')
      .run(p.id, limpar(req.body.nome) || nomeOriginal, limpar(req.body.categoria) || 'Outros', req.file.filename, req.file.size, req.file.mimetype, req.u.id, req.body.compartilhado === '1' ? 1 : 0).lastInsertRowid);
    auditar(req, 'processo', p.id, 'anexou documento', { nome: limpar(req.body.nome) || nomeOriginal });
    return { id };
  }));
  const docDoEscritorio = (req) => {
    const d = q('SELECT d.* FROM documentos d JOIN processos p ON p.id = d.processo_id WHERE d.id = ? AND p.escritorio_id = ?').get(Number(req.params.id), E(req));
    if (!d) erro(404, 'Documento não encontrado.');
    return d;
  };
  app.get('/api/documentos/:id/arquivo', r((req, res) => {
    const d = docDoEscritorio(req);
    res.download(path.join(DATA_DIR, 'documentos', d.arquivo), d.nome);
  }));
  app.patch('/api/documentos/:id/compartilhar', r((req) => {
    const d = docDoEscritorio(req);
    q('UPDATE documentos SET compartilhado = ? WHERE id = ?').run(req.body.compartilhado ? 1 : 0, d.id);
    auditar(req, 'processo', d.processo_id, req.body.compartilhado ? 'compartilhou documento com o cliente' : 'deixou de compartilhar documento', { nome: d.nome });
    return { ok: true };
  }));
  app.delete('/api/documentos/:id', r((req) => {
    const d = docDoEscritorio(req);
    fs.rmSync(path.join(DATA_DIR, 'documentos', d.arquivo), { force: true });
    q('DELETE FROM documentos WHERE id = ?').run(d.id);
    auditar(req, 'processo', d.processo_id, 'excluiu documento', { nome: d.nome });
    return { ok: true };
  }));

  // ---------- Kanban ----------
  app.get('/api/kanban', r((req) => {
    const colunas = q('SELECT * FROM kanban_colunas WHERE escritorio_id = ? ORDER BY ordem, id').all(E(req));
    const conds = ["p.escritorio_id = ?", "p.status <> 'Encerrado'"], prm = [E(req)];
    if (req.query.responsavel_id) { conds.push('p.responsavel_id = ?'); prm.push(Number(req.query.responsavel_id)); }
    if (req.query.area) { conds.push('p.area = ?'); prm.push(req.query.area); }
    if (req.query.etiqueta) { conds.push("(',' || p.etiquetas || ',') LIKE ?"); prm.push(`%,${req.query.etiqueta},%`); }
    const cartoes = q(`SELECT p.id, p.titulo, p.numero_cnj, p.area, p.etiquetas, p.coluna_id, c.nome AS cliente_nome, u.nome AS responsavel_nome,
                         (SELECT MIN(vencimento) FROM prazos WHERE processo_id = p.id AND status = 'Pendente') AS proximo_prazo
                       FROM processos p LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN usuarios u ON u.id = p.responsavel_id
                       WHERE ${conds.join(' AND ')} ORDER BY p.titulo`).all(...prm);
    const primeira = colunas[0]?.id;
    for (const c of cartoes) if (!colunas.some((col) => col.id === c.coluna_id)) c.coluna_id = primeira;
    return { colunas, cartoes };
  }));

  // ---------- Prazos ----------
  const dadosPrazo = (b, req) => {
    const titulo = limpar(b.titulo), venc = limpar(b.vencimento);
    if (!titulo) erro(400, 'Informe o título do prazo/tarefa.');
    if (!venc || !/^\d{4}-\d{2}-\d{2}/.test(venc)) erro(400, 'Informe a data de vencimento.');
    const proc = numero(b.processo_id);
    if (proc) doEscritorio('processos', proc, req);
    const resp = numero(b.responsavel_id);
    if (resp && !q('SELECT 1 FROM usuarios WHERE id = ? AND escritorio_id = ?').get(resp, E(req))) erro(400, 'Responsável inválido.');
    return [titulo, limpar(b.tipo) || 'Prazo processual', proc, resp, venc, limpar(b.prioridade) || 'Média', limpar(b.status) || 'Pendente', limpar(b.descricao)];
  };
  app.get('/api/prazos', r((req) => {
    const conds = ['pz.escritorio_id = ?'], prm = [E(req)];
    const hoje = hojeSP();
    if (req.query.situacao === 'atrasados') { conds.push("pz.status = 'Pendente' AND substr(pz.vencimento,1,10) < ?"); prm.push(hoje); }
    else if (req.query.situacao === 'hoje') { conds.push("pz.status = 'Pendente' AND substr(pz.vencimento,1,10) = ?"); prm.push(hoje); }
    else if (req.query.status) { conds.push('pz.status = ?'); prm.push(req.query.status); }
    if (req.query.responsavel_id) { conds.push('pz.responsavel_id = ?'); prm.push(Number(req.query.responsavel_id)); }
    if (req.query.tipo) { conds.push('pz.tipo = ?'); prm.push(req.query.tipo); }
    if (req.query.q) { conds.push('(pz.titulo LIKE ? OR p.titulo LIKE ?)'); prm.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    return q(`SELECT pz.*, p.titulo AS processo_titulo, u.nome AS responsavel_nome FROM prazos pz
              LEFT JOIN processos p ON p.id = pz.processo_id LEFT JOIN usuarios u ON u.id = pz.responsavel_id
              WHERE ${conds.join(' AND ')} ORDER BY pz.status = 'Pendente' DESC, pz.vencimento LIMIT 300`).all(...prm);
  }));
  app.post('/api/prazos', r((req) => {
    const id = Number(q('INSERT INTO prazos (escritorio_id, titulo, tipo, processo_id, responsavel_id, vencimento, prioridade, status, descricao) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(E(req), ...dadosPrazo(req.body, req)).lastInsertRowid);
    if (req.body.processo_id) auditar(req, 'processo', Number(req.body.processo_id), 'criou prazo', { titulo: req.body.titulo });
    return { id };
  }));
  app.put('/api/prazos/:id', r((req) => {
    const pz = doEscritorio('prazos', req.params.id, req);
    q('UPDATE prazos SET titulo=?, tipo=?, processo_id=?, responsavel_id=?, vencimento=?, prioridade=?, status=?, descricao=? WHERE id = ?')
      .run(...dadosPrazo(req.body, req), pz.id);
    return { id: pz.id };
  }));
  app.patch('/api/prazos/:id/status', r((req) => {
    const pz = doEscritorio('prazos', req.params.id, req);
    if (!['Pendente', 'Concluído', 'Cancelado'].includes(req.body.status)) erro(400, 'Status inválido.');
    q('UPDATE prazos SET status = ? WHERE id = ?').run(req.body.status, pz.id);
    return { ok: true };
  }));
  app.delete('/api/prazos/:id', r((req) => {
    const pz = doEscritorio('prazos', req.params.id, req);
    q('DELETE FROM prazos WHERE id = ?').run(pz.id);
    return { ok: true };
  }));
  app.post('/api/prazos/calcular', r((req) => {
    const inicio = limpar(req.body.inicio), dias = Number(req.body.dias);
    if (!inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) erro(400, 'Informe a data da publicação/intimação.');
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) erro(400, 'Informe a quantidade de dias (1 a 365).');
    const fer = q('SELECT data, nome FROM feriados WHERE escritorio_id = ?').all(E(req));
    const res = calcularPrazo(inicio, dias, new Set(fer.map((f) => f.data)));
    const nomes = Object.fromEntries(fer.map((f) => [f.data, f.nome]));
    res.feriados = res.pulados.filter((d) => nomes[d]).map((d) => ({ data: d, nome: nomes[d] }));
    return res;
  }));

  // ---------- Agenda ----------
  const dadosEvento = (b, req) => {
    const titulo = limpar(b.titulo), inicio = limpar(b.inicio);
    if (!titulo || !inicio) erro(400, 'Informe título e data/hora de início.');
    const proc = numero(b.processo_id), cli = numero(b.cliente_id), resp = numero(b.responsavel_id);
    if (proc) doEscritorio('processos', proc, req);
    if (cli) doEscritorio('clientes', cli, req);
    if (resp && !q('SELECT 1 FROM usuarios WHERE id = ? AND escritorio_id = ?').get(resp, E(req))) erro(400, 'Responsável inválido.');
    return [titulo, limpar(b.tipo) || 'Reunião', inicio, limpar(b.fim), limpar(b.local), proc, cli, resp, limpar(b.descricao)];
  };
  app.get('/api/agenda', r((req) => {
    const de = String(req.query.de || ''), ate = String(req.query.ate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) erro(400, 'Período inválido.');
    const filtroResp = req.query.responsavel_id ? ' AND x.responsavel_id = ' + Number(req.query.responsavel_id) : '';
    const eventos = q(`SELECT x.*, u.nome AS responsavel_nome, p.titulo AS processo_titulo, c.nome AS cliente_nome FROM eventos x
                       LEFT JOIN usuarios u ON u.id = x.responsavel_id LEFT JOIN processos p ON p.id = x.processo_id LEFT JOIN clientes c ON c.id = x.cliente_id
                       WHERE x.escritorio_id = ? AND substr(x.inicio,1,10) BETWEEN ? AND ?${filtroResp} ORDER BY x.inicio`).all(E(req), de, ate);
    const prazos = q(`SELECT x.*, u.nome AS responsavel_nome, p.titulo AS processo_titulo FROM prazos x
                      LEFT JOIN usuarios u ON u.id = x.responsavel_id LEFT JOIN processos p ON p.id = x.processo_id
                      WHERE x.escritorio_id = ? AND x.status <> 'Cancelado' AND substr(x.vencimento,1,10) BETWEEN ? AND ?${filtroResp} ORDER BY x.vencimento`).all(E(req), de, ate);
    const feriados = q('SELECT data, nome FROM feriados WHERE escritorio_id = ? AND data BETWEEN ? AND ?').all(E(req), de, ate);
    return { eventos, prazos, feriados };
  }));
  app.post('/api/eventos', r((req) => ({
    id: Number(q('INSERT INTO eventos (escritorio_id, titulo, tipo, inicio, fim, local, processo_id, cliente_id, responsavel_id, descricao) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(E(req), ...dadosEvento(req.body, req)).lastInsertRowid),
  })));
  app.put('/api/eventos/:id', r((req) => {
    const ev = doEscritorio('eventos', req.params.id, req);
    q('UPDATE eventos SET titulo=?, tipo=?, inicio=?, fim=?, local=?, processo_id=?, cliente_id=?, responsavel_id=?, descricao=? WHERE id = ?')
      .run(...dadosEvento(req.body, req), ev.id);
    return { id: ev.id };
  }));
  app.delete('/api/eventos/:id', r((req) => {
    const ev = doEscritorio('eventos', req.params.id, req);
    q('DELETE FROM eventos WHERE id = ?').run(ev.id);
    return { ok: true };
  }));

  // ---------- Financeiro ----------
  const filtroFin = (req) => {
    const conds = ['l.escritorio_id = ?'], prm = [E(req)], hoje = hojeSP();
    if (req.query.de) { conds.push('l.vencimento >= ?'); prm.push(req.query.de); }
    if (req.query.ate) { conds.push('l.vencimento <= ?'); prm.push(req.query.ate); }
    if (req.query.tipo) { conds.push('l.tipo = ?'); prm.push(req.query.tipo); }
    if (req.query.cliente_id) { conds.push('l.cliente_id = ?'); prm.push(Number(req.query.cliente_id)); }
    if (req.query.status === 'Pago') conds.push('l.pago_em IS NOT NULL');
    if (req.query.status === 'Pendente') { conds.push('l.pago_em IS NULL AND l.vencimento >= ?'); prm.push(hoje); }
    if (req.query.status === 'Atrasado') { conds.push('l.pago_em IS NULL AND l.vencimento < ?'); prm.push(hoje); }
    return { where: conds.join(' AND '), prm, hoje };
  };
  const statusLanc = (l, hoje) => (l.pago_em ? 'Pago' : l.vencimento < hoje ? 'Atrasado' : 'Pendente');
  const listarLanc = (req) => {
    const { where, prm, hoje } = filtroFin(req);
    const itens = q(`SELECT l.*, c.nome AS cliente_nome, p.titulo AS processo_titulo FROM lancamentos l
                     LEFT JOIN clientes c ON c.id = l.cliente_id LEFT JOIN processos p ON p.id = l.processo_id
                     WHERE ${where} ORDER BY l.vencimento, l.id`).all(...prm);
    for (const l of itens) l.status = statusLanc(l, hoje);
    return itens;
  };
  app.get('/api/financeiro', financeiro, r((req) => {
    const itens = listarLanc(req);
    const soma = (f) => itens.filter(f).reduce((s, l) => s + l.valor, 0);
    return {
      itens,
      totais: {
        receitas: soma((l) => l.tipo === 'receita'),
        recebido: soma((l) => l.tipo === 'receita' && l.status === 'Pago'),
        despesas: soma((l) => l.tipo === 'despesa'),
        pagas: soma((l) => l.tipo === 'despesa' && l.status === 'Pago'),
        atrasado: soma((l) => l.tipo === 'receita' && l.status === 'Atrasado'),
      },
    };
  }));
  app.get('/api/financeiro/csv', financeiro, r((req, res) => {
    const itens = listarLanc(req);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const br = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
    const linhas = [['Tipo', 'Categoria', 'Descrição', 'Cliente', 'Processo', 'Parcela', 'Vencimento', 'Valor (R$)', 'Status', 'Pago em', 'Forma de pagamento'].map(esc).join(';')];
    for (const l of itens) linhas.push([l.tipo === 'receita' ? 'Receita' : 'Despesa', l.categoria, l.descricao, l.cliente_nome, l.processo_titulo,
      l.total_parcelas ? `${l.parcela}/${l.total_parcelas}` : '', br(l.vencimento), l.valor.toFixed(2).replace('.', ','), l.status, br(l.pago_em), l.forma_pagamento].map(esc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financeiro-${hojeSP()}.csv"`);
    res.send('﻿' + linhas.join('\r\n'));
  }));
  const validarVinculos = (b, req) => {
    const cli = numero(b.cliente_id), proc = numero(b.processo_id);
    if (cli) doEscritorio('clientes', cli, req);
    if (proc) doEscritorio('processos', proc, req);
    return [cli, proc];
  };
  app.post('/api/financeiro', financeiro, r((req) => {
    const b = req.body;
    const tipo = b.tipo === 'despesa' ? 'despesa' : 'receita';
    const desc = limpar(b.descricao), valor = Number(b.valor), venc = limpar(b.vencimento);
    const parcelas = Math.min(60, Math.max(1, Number(b.parcelas) || 1));
    if (!desc) erro(400, 'Informe a descrição.');
    if (!(valor > 0)) erro(400, 'Informe um valor maior que zero.');
    if (!venc) erro(400, 'Informe o vencimento.');
    const [cli, proc] = validarVinculos(b, req);
    const categoria = limpar(b.categoria) || (tipo === 'receita' ? 'Honorários contratuais' : 'Despesas do escritório');
    // Divide em centavos para que a soma das parcelas feche exatamente no total.
    const centavos = Math.round(valor * 100), base = Math.floor(centavos / parcelas), resto = centavos - base * parcelas;
    const grupo = parcelas > 1 ? crypto.randomUUID() : null;
    const ids = [];
    db.exec('BEGIN');
    try {
      for (let i = 0; i < parcelas; i++) {
        const d = deIso(venc);
        const alvo = new Date(d.getFullYear(), d.getMonth() + i, 1);
        const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
        alvo.setDate(Math.min(d.getDate(), ultimo));
        const v = (base + (i < resto ? 1 : 0)) / 100;
        const pago = i === 0 && b.pago ? (limpar(b.pago_em) || hojeSP()) : null;
        ids.push(Number(q(`INSERT INTO lancamentos (escritorio_id, tipo, categoria, descricao, valor, vencimento, pago_em, forma_pagamento, parcela, total_parcelas, grupo, cliente_id, processo_id, criado_por)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(E(req), tipo, categoria, desc, v, iso(alvo), pago, limpar(b.forma_pagamento), parcelas > 1 ? i + 1 : null, parcelas > 1 ? parcelas : null, grupo, cli, proc, req.u.id).lastInsertRowid));
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    auditar(req, 'lancamento', ids[0], 'criou', { descricao: desc, valor, parcelas });
    return { ids };
  }));
  app.put('/api/financeiro/:id', financeiro, r((req) => {
    const l = doEscritorio('lancamentos', req.params.id, req);
    const b = req.body;
    const desc = limpar(b.descricao), valor = Number(b.valor), venc = limpar(b.vencimento);
    if (!desc || !(valor > 0) || !venc) erro(400, 'Preencha descrição, valor e vencimento.');
    const [cli, proc] = validarVinculos(b, req);
    q(`UPDATE lancamentos SET tipo=?, categoria=?, descricao=?, valor=?, vencimento=?, forma_pagamento=?, cliente_id=?, processo_id=?, alterado_por=?, alterado_em=datetime('now') WHERE id = ?`)
      .run(b.tipo === 'despesa' ? 'despesa' : 'receita', limpar(b.categoria) || l.categoria, desc, valor, venc, limpar(b.forma_pagamento), cli, proc, req.u.id, l.id);
    auditar(req, 'lancamento', l.id, 'alterou', { de: { valor: l.valor, vencimento: l.vencimento }, para: { valor, vencimento: venc } });
    return { id: l.id };
  }));
  app.post('/api/financeiro/:id/pagar', financeiro, r((req) => {
    const l = doEscritorio('lancamentos', req.params.id, req);
    const data = limpar(req.body.pago_em) || hojeSP();
    q("UPDATE lancamentos SET pago_em = ?, forma_pagamento = COALESCE(?, forma_pagamento), alterado_por = ?, alterado_em = datetime('now') WHERE id = ?")
      .run(data, limpar(req.body.forma_pagamento), req.u.id, l.id);
    auditar(req, 'lancamento', l.id, 'marcou como pago', { pago_em: data });
    return { ok: true };
  }));
  app.post('/api/financeiro/:id/estornar', financeiro, r((req) => {
    const l = doEscritorio('lancamentos', req.params.id, req);
    q("UPDATE lancamentos SET pago_em = NULL, alterado_por = ?, alterado_em = datetime('now') WHERE id = ?").run(req.u.id, l.id);
    auditar(req, 'lancamento', l.id, 'desfez pagamento');
    return { ok: true };
  }));
  app.delete('/api/financeiro/:id', financeiro, r((req) => {
    const l = doEscritorio('lancamentos', req.params.id, req);
    q('DELETE FROM lancamentos WHERE id = ?').run(l.id);
    auditar(req, 'lancamento', l.id, 'excluiu', { descricao: l.descricao, valor: l.valor });
    return { ok: true };
  }));

  // ---------- Configurações ----------
  app.get('/api/config/escritorio', r((req) => q('SELECT * FROM escritorios WHERE id = ?').get(E(req))));
  app.put('/api/config/escritorio', admin, r((req) => {
    const b = req.body, nome = limpar(b.nome);
    if (!nome) erro(400, 'Informe o nome do escritório.');
    if (limpar(b.cnpj) && !cnpjValido(b.cnpj)) erro(400, 'CNPJ inválido.');
    q('UPDATE escritorios SET nome=?, cnpj=?, oab=?, telefone=?, email=? WHERE id = ?').run(nome, limpar(b.cnpj), limpar(b.oab), limpar(b.telefone), limpar(b.email), E(req));
    return { ok: true };
  }));
  app.post('/api/config/membros', admin, r((req) => {
    const nome = limpar(req.body.nome), email = limpar(req.body.email)?.toLowerCase();
    const papel = ['admin', 'advogado', 'estagiario'].includes(req.body.papel) ? req.body.papel : 'advogado';
    if (!nome || !email || !/^\S+@\S+\.\S+$/.test(email)) erro(400, 'Informe nome e e-mail válidos.');
    if (q('SELECT 1 FROM usuarios WHERE email = ?').get(email)) erro(409, 'Este e-mail já está cadastrado.');
    const id = Number(q('INSERT INTO usuarios (escritorio_id, nome, email, papel) VALUES (?,?,?,?)').run(E(req), nome, email, papel).lastInsertRowid);
    return { id };
  }));
  app.put('/api/config/membros/:id', admin, r((req) => {
    const u = q('SELECT * FROM usuarios WHERE id = ? AND escritorio_id = ?').get(Number(req.params.id), E(req));
    if (!u) erro(404, 'Membro não encontrado.');
    const papel = ['admin', 'advogado', 'estagiario'].includes(req.body.papel) ? req.body.papel : u.papel;
    const ativo = req.body.ativo === undefined ? u.ativo : req.body.ativo ? 1 : 0;
    if (u.id === req.u.id && (papel !== 'admin' || !ativo)) erro(400, 'Você não pode remover seu próprio acesso de administrador.');
    q('UPDATE usuarios SET papel = ?, ativo = ? WHERE id = ?').run(papel, ativo, u.id);
    if (!ativo) q('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
    return { ok: true };
  }));
  app.delete('/api/config/membros/:id', admin, r((req) => {
    const u = q('SELECT * FROM usuarios WHERE id = ? AND escritorio_id = ? AND senha_hash IS NULL').get(Number(req.params.id), E(req));
    if (!u) erro(400, 'Só convites ainda não aceitos podem ser excluídos. Para os demais, desative o acesso.');
    q('DELETE FROM usuarios WHERE id = ?').run(u.id);
    return { ok: true };
  }));

  app.get('/api/config/colunas', r((req) => q('SELECT * FROM kanban_colunas WHERE escritorio_id = ? ORDER BY ordem, id').all(E(req))));
  app.post('/api/config/colunas', admin, r((req) => {
    const nome = limpar(req.body.nome);
    if (!nome) erro(400, 'Informe o nome da coluna.');
    const ordem = q('SELECT COALESCE(MAX(ordem),-1)+1 o FROM kanban_colunas WHERE escritorio_id = ?').get(E(req)).o;
    return { id: Number(q('INSERT INTO kanban_colunas (escritorio_id, nome, ordem) VALUES (?,?,?)').run(E(req), nome, ordem).lastInsertRowid) };
  }));
  app.put('/api/config/colunas/:id', admin, r((req) => {
    const c = doEscritorio('kanban_colunas', req.params.id, req);
    const nome = limpar(req.body.nome);
    if (!nome) erro(400, 'Informe o nome da coluna.');
    q('UPDATE kanban_colunas SET nome = ? WHERE id = ?').run(nome, c.id);
    return { ok: true };
  }));
  app.post('/api/config/colunas/ordem', admin, r((req) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
    ids.forEach((id, i) => q('UPDATE kanban_colunas SET ordem = ? WHERE id = ? AND escritorio_id = ?').run(i, id, E(req)));
    return { ok: true };
  }));
  app.delete('/api/config/colunas/:id', admin, r((req) => {
    const c = doEscritorio('kanban_colunas', req.params.id, req);
    const n = q('SELECT COUNT(*) n FROM kanban_colunas WHERE escritorio_id = ?').get(E(req)).n;
    if (n <= 1) erro(400, 'O Kanban precisa de pelo menos uma coluna.');
    const destino = q('SELECT id FROM kanban_colunas WHERE escritorio_id = ? AND id <> ? ORDER BY ordem LIMIT 1').get(E(req), c.id);
    q('UPDATE processos SET coluna_id = ? WHERE coluna_id = ?').run(destino.id, c.id);
    q('DELETE FROM kanban_colunas WHERE id = ?').run(c.id);
    return { ok: true };
  }));

  app.get('/api/config/etiquetas', r((req) => {
    const todas = new Set();
    for (const { etiquetas } of q("SELECT etiquetas FROM processos WHERE escritorio_id = ? AND etiquetas <> ''").all(E(req)))
      etiquetas.split(',').forEach((t) => t && todas.add(t));
    return [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }));

  app.get('/api/config/feriados', r((req) => q('SELECT * FROM feriados WHERE escritorio_id = ? ORDER BY data').all(E(req))));
  app.post('/api/config/feriados', admin, r((req) => {
    const data = limpar(req.body.data), nome = limpar(req.body.nome);
    if (!data || !nome) erro(400, 'Informe data e nome do feriado.');
    try { q('INSERT INTO feriados (escritorio_id, data, nome) VALUES (?,?,?)').run(E(req), data, nome); }
    catch { erro(409, 'Já existe um feriado nesta data.'); }
    return { ok: true };
  }));
  app.post('/api/config/feriados/nacionais', admin, r((req) => {
    const ano = Number(req.body.ano);
    if (!(ano >= 2000 && ano <= 2100)) erro(400, 'Ano inválido.');
    let n = 0;
    for (const [data, nome] of feriadosNacionais(ano)) n += Number(q('INSERT OR IGNORE INTO feriados (escritorio_id, data, nome) VALUES (?,?,?)').run(E(req), data, nome).changes);
    return { adicionados: n };
  }));
  app.delete('/api/config/feriados/:id', admin, r((req) => {
    const f = doEscritorio('feriados', req.params.id, req);
    q('DELETE FROM feriados WHERE id = ?').run(f.id);
    return { ok: true };
  }));

  app.post('/api/config/demo', admin, r((req) => carregarDemo(db, req.u)));

  // ---------- Erros ----------
  app.use('/api', (_req, _res, next) => next(new ErroHttp(404, 'Rota não encontrada.')));
  app.use((e, _req, res, _next) => {
    if (e instanceof multer.MulterError) return res.status(400).json({ erro: e.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 25 MB.' : 'Falha no envio do arquivo.' });
    if (e instanceof ErroHttp) return res.status(e.status).json({ erro: e.message });
    if (e.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados enviados em formato inválido.' });
    console.error(e);
    res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  });
  return app;
}
