import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { hashSenha, conferirSenha, novoToken, hojeSP, agoraSP } from './util.js';

const DIAS_SESSAO = 30;

/** Rotas usadas pelo CLIENTE do escritório (portal). Cookie e sessão separados da equipe. */
export function rotasPortal(db) {
  const r = express.Router();
  const q = (sql) => db.prepare(sql);
  const falha = (res, status, erro) => res.status(status).json({ erro });

  const lerCookie = (req) => {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('jn_portal='));
    return m ? decodeURIComponent(m.slice('jn_portal='.length)) : null;
  };
  const abrirSessao = (res, clienteId) => {
    const token = novoToken();
    q('INSERT INTO sessoes_portal (token, cliente_id, expira_em) VALUES (?,?,?)').run(token, clienteId, new Date(Date.now() + DIAS_SESSAO * 864e5).toISOString());
    q("UPDATE clientes SET portal_ultimo_acesso = datetime('now') WHERE id = ?").run(clienteId);
    res.setHeader('Set-Cookie', `jn_portal=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS_SESSAO * 86400}`);
  };

  r.use((req, _res, next) => {
    const token = lerCookie(req);
    if (token) {
      const c = q(`SELECT c.id, c.nome, c.email, c.escritorio_id FROM sessoes_portal s JOIN clientes c ON c.id = s.cliente_id
                   WHERE s.token = ? AND s.expira_em > ? AND c.portal_ativo = 1`).get(token, new Date().toISOString());
      if (c) { req.cliente = c; req.tokenPortal = token; }
    }
    next();
  });

  // ----- Acesso -----
  r.get('/convite/:token', (req, res) => {
    const c = q('SELECT c.nome, c.email, e.nome AS escritorio FROM clientes c JOIN escritorios e ON e.id = c.escritorio_id WHERE c.portal_token = ?').get(String(req.params.token));
    if (!c) return falha(res, 404, 'Link de acesso inválido ou já utilizado. Peça um novo link ao escritório.');
    res.json(c);
  });
  r.post('/ativar', (req, res) => {
    const senha = String(req.body.senha || '');
    const c = q('SELECT id FROM clientes WHERE portal_token = ?').get(String(req.body.token || ''));
    if (!c) return falha(res, 404, 'Link de acesso inválido ou já utilizado. Peça um novo link ao escritório.');
    if (senha.length < 8) return falha(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
    q('UPDATE clientes SET portal_senha_hash = ?, portal_token = NULL, portal_ativo = 1 WHERE id = ?').run(hashSenha(senha), c.id);
    abrirSessao(res, c.id);
    res.json({ ok: true });
  });
  r.post('/entrar', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase(), senha = String(req.body.senha || '');
    const candidatos = q('SELECT id, portal_senha_hash FROM clientes WHERE lower(email) = ? AND portal_ativo = 1').all(email);
    const c = candidatos.find((x) => conferirSenha(senha, x.portal_senha_hash));
    if (!c) return falha(res, 401, 'E-mail ou senha incorretos.');
    abrirSessao(res, c.id);
    res.json({ ok: true });
  });
  r.post('/sair', (req, res) => {
    if (req.tokenPortal) q('DELETE FROM sessoes_portal WHERE token = ?').run(req.tokenPortal);
    res.setHeader('Set-Cookie', 'jn_portal=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  r.get('/eu', (req, res) => {
    if (!req.cliente) return res.json({ cliente: null });
    const esc = q('SELECT nome, telefone, email FROM escritorios WHERE id = ?').get(req.cliente.escritorio_id);
    res.json({ cliente: { id: req.cliente.id, nome: req.cliente.nome, email: req.cliente.email }, escritorio: esc });
  });

  r.use((req, res, next) => (req.cliente ? next() : falha(res, 401, 'Faça login para continuar.')));
  const C = (req) => req.cliente.id;
  const processoDoCliente = (req, id) => q('SELECT * FROM processos WHERE id = ? AND cliente_id = ?').get(Number(id), C(req));

  // ----- Conteúdo -----
  r.get('/resumo', (req, res) => {
    const hoje = hojeSP();
    const processos = q(`SELECT p.id, p.titulo, p.numero_cnj, p.area, p.fase, p.status, p.tribunal, p.vara, p.comarca, u.nome AS responsavel_nome,
                           (SELECT data || '|' || descricao FROM andamentos a WHERE a.processo_id = p.id AND a.visivel_cliente = 1 ORDER BY data DESC, id DESC LIMIT 1) AS ultimo
                         FROM processos p LEFT JOIN usuarios u ON u.id = p.responsavel_id
                         WHERE p.cliente_id = ? ORDER BY p.status = 'Encerrado', p.titulo`).all(C(req));
    for (const p of processos) {
      if (p.ultimo) { const i = p.ultimo.indexOf('|'); p.ultimo_andamento = { data: p.ultimo.slice(0, i), descricao: p.ultimo.slice(i + 1) }; }
      delete p.ultimo;
    }
    const eventos = q(`SELECT e.id, e.titulo, e.tipo, e.inicio, e.fim, e.local, p.titulo AS processo_titulo FROM eventos e LEFT JOIN processos p ON p.id = e.processo_id
                       WHERE (e.cliente_id = ? OR p.cliente_id = ?) AND (CASE WHEN length(e.inicio) = 10 THEN e.inicio >= ? ELSE e.inicio >= ? END)
                       ORDER BY e.inicio LIMIT 10`).all(C(req), C(req), hoje, agoraSP());
    const parcelas = q(`SELECT id, descricao, valor, vencimento, pago_em, parcela, total_parcelas, forma_pagamento FROM lancamentos
                        WHERE cliente_id = ? AND tipo = 'receita' ORDER BY vencimento`).all(C(req));
    for (const l of parcelas) l.status = l.pago_em ? 'Pago' : l.vencimento < hoje ? 'Atrasado' : 'Pendente';
    const naoLidas = q("SELECT COUNT(*) n FROM mensagens WHERE cliente_id = ? AND autor = 'escritorio' AND lida = 0").get(C(req)).n;
    res.json({ processos, eventos, parcelas, naoLidas });
  });

  r.get('/processos/:id', (req, res) => {
    const p = processoDoCliente(req, req.params.id);
    if (!p) return falha(res, 404, 'Processo não encontrado.');
    const resp = p.responsavel_id ? q('SELECT nome FROM usuarios WHERE id = ?').get(p.responsavel_id) : null;
    res.json({
      id: p.id, titulo: p.titulo, numero_cnj: p.numero_cnj, area: p.area, fase: p.fase, status: p.status,
      tribunal: p.tribunal, vara: p.vara, comarca: p.comarca, parte_contraria: p.parte_contraria, responsavel_nome: resp?.nome || null,
      andamentos: q('SELECT id, data, descricao FROM andamentos WHERE processo_id = ? AND visivel_cliente = 1 ORDER BY data DESC, id DESC').all(p.id),
      documentos: q('SELECT id, nome, categoria, tamanho, criado_em, enviado_por_cliente FROM documentos WHERE processo_id = ? AND (compartilhado = 1 OR enviado_por_cliente = 1) ORDER BY criado_em DESC').all(p.id),
      eventos: q("SELECT id, titulo, tipo, inicio, local FROM eventos WHERE processo_id = ? AND (CASE WHEN length(inicio) = 10 THEN inicio >= ? ELSE inicio >= ? END) ORDER BY inicio").all(p.id, hojeSP(), agoraSP()),
    });
  });

  const upload = multer({
    storage: multer.diskStorage({ destination: path.join(DATA_DIR, 'documentos'), filename: (_q, _f, cb) => cb(null, crypto.randomUUID()) }),
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  r.post('/processos/:id/documentos', (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (err) return falha(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 25 MB.' : 'Falha no envio do arquivo.');
    const p = processoDoCliente(req, req.params.id);
    if (!p) { if (req.file) fs.rmSync(req.file.path, { force: true }); return falha(res, 404, 'Processo não encontrado.'); }
    if (!req.file) return falha(res, 400, 'Selecione um arquivo.');
    const nome = String(req.body.nome || '').trim() || Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    q("INSERT INTO documentos (processo_id, nome, categoria, arquivo, tamanho, tipo_mime, compartilhado, enviado_por_cliente) VALUES (?,?,?,?,?,?,1,1)")
      .run(p.id, nome, 'Documento do cliente', req.file.filename, req.file.size, req.file.mimetype);
    q("INSERT INTO mensagens (escritorio_id, cliente_id, autor, texto) VALUES (?,?, 'cliente', ?)").run(p.escritorio_id, C(req), `📎 Enviei o documento "${nome}" no processo "${p.titulo}".`);
    q("INSERT INTO auditoria (escritorio_id, entidade, entidade_id, acao, detalhes) VALUES (?, 'processo', ?, 'recebeu documento do cliente', ?)").run(p.escritorio_id, p.id, JSON.stringify({ nome }));
    res.json({ ok: true });
  }));
  r.get('/documentos/:id/arquivo', (req, res) => {
    const d = q(`SELECT d.* FROM documentos d JOIN processos p ON p.id = d.processo_id
                 WHERE d.id = ? AND p.cliente_id = ? AND (d.compartilhado = 1 OR d.enviado_por_cliente = 1)`).get(Number(req.params.id), C(req));
    if (!d) return falha(res, 404, 'Documento não encontrado.');
    res.download(path.join(DATA_DIR, 'documentos', d.arquivo), d.nome);
  });

  // ----- Mensagens -----
  r.get('/mensagens', (req, res) => {
    const itens = q(`SELECT m.id, m.autor, m.texto, m.criado_em, u.nome AS usuario_nome FROM mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id
                     WHERE m.cliente_id = ? ORDER BY m.id DESC LIMIT 200`).all(C(req)).reverse();
    q("UPDATE mensagens SET lida = 1 WHERE cliente_id = ? AND autor = 'escritorio' AND lida = 0").run(C(req));
    res.json(itens);
  });
  r.post('/mensagens', (req, res) => {
    const texto = String(req.body.texto || '').trim();
    if (!texto) return falha(res, 400, 'Escreva a mensagem.');
    if (texto.length > 4000) return falha(res, 400, 'Mensagem muito longa.');
    q("INSERT INTO mensagens (escritorio_id, cliente_id, autor, texto) VALUES (?,?, 'cliente', ?)").run(req.cliente.escritorio_id, C(req), texto);
    res.json({ ok: true });
  });

  r.use((_req, res) => falha(res, 404, 'Rota não encontrada.'));
  return r;
}
