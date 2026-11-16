import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.JURISNEXO_DATA || path.resolve('dados');
fs.mkdirSync(path.join(DATA_DIR, 'documentos'), { recursive: true });

export function abrirBanco(arquivo = path.join(DATA_DIR, 'jurisnexo.db')) {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS escritorios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT, oab TEXT, telefone TEXT, email TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT,
  papel TEXT NOT NULL CHECK (papel IN ('admin','advogado','estagiario')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome TEXT NOT NULL,
  documento TEXT, rg TEXT, nascimento TEXT,
  telefone TEXT, whatsapp TEXT, email TEXT,
  cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kanban_colunas (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS processos (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  numero_cnj TEXT,
  titulo TEXT NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  parte_contraria TEXT,
  area TEXT NOT NULL DEFAULT 'Cível',
  tribunal TEXT, vara TEXT, comarca TEXT,
  fase TEXT NOT NULL DEFAULT 'Inicial',
  valor_causa REAL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  etiquetas TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ativo',
  coluna_id INTEGER REFERENCES kanban_colunas(id) ON DELETE SET NULL,
  anotacoes TEXT NOT NULL DEFAULT '',
  criado_por INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  alterado_por INTEGER, alterado_em TEXT
);
CREATE TABLE IF NOT EXISTS andamentos (
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  criado_por INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Outros',
  arquivo TEXT NOT NULL,
  tamanho INTEGER,
  tipo_mime TEXT,
  enviado_por INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prazos (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Prazo processual',
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  vencimento TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'Média',
  status TEXT NOT NULL DEFAULT 'Pendente',
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Reunião',
  inicio TEXT NOT NULL,
  fim TEXT,
  local TEXT,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL,
  pago_em TEXT,
  forma_pagamento TEXT,
  parcela INTEGER, total_parcelas INTEGER, grupo TEXT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  criado_por INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  alterado_por INTEGER, alterado_em TEXT
);
CREATE TABLE IF NOT EXISTS feriados (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  nome TEXT NOT NULL,
  UNIQUE (escritorio_id, data)
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  escritorio_id INTEGER NOT NULL,
  usuario_id INTEGER,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL,
  detalhes TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_proc_esc ON processos(escritorio_id);
CREATE INDEX IF NOT EXISTS ix_cli_esc ON clientes(escritorio_id);
CREATE INDEX IF NOT EXISTS ix_prazo_esc ON prazos(escritorio_id, vencimento);
CREATE INDEX IF NOT EXISTS ix_evento_esc ON eventos(escritorio_id, inicio);
CREATE INDEX IF NOT EXISTS ix_lanc_esc ON lancamentos(escritorio_id, vencimento);
`;
