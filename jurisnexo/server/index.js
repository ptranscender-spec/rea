import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './db.js';
import { criarApp } from './app.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = abrirBanco();
const app = criarApp(db);

const dist = path.join(raiz, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, () => {
  console.log(`JurisNexo rodando em http://localhost:${porta}`);
  if (!fs.existsSync(dist)) console.log('Aviso: a interface ainda não foi gerada. Rode "npm run build" ou use "npm run dev:web".');
});
