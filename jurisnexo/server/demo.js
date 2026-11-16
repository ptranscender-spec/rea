import { hojeSP, deIso, iso, calcularPrazo } from './util.js';

// Gera dígitos verificadores válidos para os dados fictícios.
function cpf(base9) {
  const d = base9.split('').map(Number);
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += d[i] * (t + 1 - i);
    d.push(((s * 10) % 11) % 10);
  }
  const c = d.join('');
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}
function cnpj(base12) {
  const d = base12.split('').map(Number);
  for (const n of [12, 13]) {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + d[i] * p, 0) % 11;
    d.push(r < 2 ? 0 : 11 - r);
  }
  const c = d.join('');
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
function cnj(seq, ano, j, tr, orig) {
  const n = String(seq).padStart(7, '0'), o = String(orig).padStart(4, '0'), t = String(tr).padStart(2, '0');
  const dv = String(98n - (BigInt(`${n}${ano}${j}${t}${o}00`) % 97n)).padStart(2, '0');
  return `${n}-${dv}.${ano}.${j}.${t}.${o}`;
}

export function carregarDemo(db, usuario) {
  const e = usuario.escritorio_id;
  const q = (sql) => db.prepare(sql);
  const ja = q("SELECT COUNT(*) n FROM clientes WHERE escritorio_id = ? AND observacoes LIKE '[demo]%'").get(e).n;
  if (ja) return { mensagem: 'Os dados de demonstração já foram carregados.' };

  const hoje = deIso(hojeSP());
  const dia = (n, hora) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return hora ? `${iso(d)}T${hora}` : iso(d); };
  const feriados = new Set(q('SELECT data FROM feriados WHERE escritorio_id = ?').all(e).map((f) => f.data));
  const colunas = q('SELECT id FROM kanban_colunas WHERE escritorio_id = ? ORDER BY ordem').all(e).map((c) => c.id);
  const col = (i) => colunas[Math.min(i, colunas.length - 1)];

  db.exec('BEGIN');
  try {
    // Equipe fictícia (convites ainda não aceitos)
    const membro = (nome, email, papel) => {
      const ex = q('SELECT id FROM usuarios WHERE email = ?').get(email);
      return ex ? ex.id : Number(q('INSERT INTO usuarios (escritorio_id, nome, email, papel) VALUES (?,?,?,?)').run(e, nome, email, papel).lastInsertRowid);
    };
    const eu = usuario.id;
    const adv = membro('Dra. Helena Duarte (demo)', `helena.demo.${e}@exemplo.com.br`, 'advogado');
    const est = membro('Lucas Prado (demo)', `lucas.demo.${e}@exemplo.com.br`, 'estagiario');

    const cli = (tipo, nome, doc, tel, email, cidade, uf) => Number(q(`INSERT INTO clientes (escritorio_id, tipo, nome, documento, telefone, whatsapp, email, cidade, uf, observacoes)
      VALUES (?,?,?,?,?,?,?,?,?, '[demo] Cliente fictício para testes.')`).run(e, tipo, nome, doc, tel, tel, email, cidade, uf).lastInsertRowid);
    const c1 = cli('PF', 'Mariana Costa Albuquerque', cpf('529982247'), '(11) 98765-4321', 'mariana.costa@exemplo.com.br', 'São Paulo', 'SP');
    const c2 = cli('PF', 'José Ribamar Ferreira', cpf('123456789'), '(98) 99123-4567', 'jose.ferreira@exemplo.com.br', 'São Luís', 'MA');
    const c3 = cli('PJ', 'Padaria Pão Dourado Ltda.', cnpj('112223330001'), '(31) 3222-1100', 'contato@paodourado.exemplo.com.br', 'Belo Horizonte', 'MG');
    const c4 = cli('PF', 'Ana Beatriz Nogueira', cpf('987654321'), '(21) 97654-3210', 'ana.nogueira@exemplo.com.br', 'Rio de Janeiro', 'RJ');
    const c5 = cli('PJ', 'TechNova Soluções Digitais S.A.', cnpj('445556660001'), '(41) 3030-4040', 'juridico@technova.exemplo.com.br', 'Curitiba', 'PR');

    const ano = hoje.getFullYear();
    const proc = (o) => Number(q(`INSERT INTO processos (escritorio_id, numero_cnj, titulo, cliente_id, parte_contraria, area, tribunal, vara, comarca, fase, valor_causa, responsavel_id, etiquetas, status, coluna_id, anotacoes, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e, o.cnj, o.titulo, o.cliente, o.contra, o.area, o.tribunal, o.vara, o.comarca, o.fase, o.valor, o.resp, o.tags, o.status || 'Ativo', col(o.col), o.notas || '', eu).lastInsertRowid);
    const p1 = proc({ cnj: cnj(1012345, ano - 1, 8, 26, 100), titulo: 'Ação de indenização por danos morais', cliente: c1, contra: 'Banco Exemplo S.A.', area: 'Consumidor', tribunal: 'TJSP', vara: '3ª Vara Cível', comarca: 'São Paulo', fase: 'Instrução', valor: 30000, resp: eu, tags: 'Urgente,Negativação', col: 1, notas: 'Cliente teve o nome negativado indevidamente. Juntar extratos.' });
    const p2 = proc({ cnj: cnj(2004567, ano - 1, 5, 16, 1), titulo: 'Reclamação trabalhista — horas extras', cliente: c2, contra: 'Construtora Horizonte Ltda.', area: 'Trabalhista', tribunal: 'TRT-16', vara: '1ª Vara do Trabalho', comarca: 'São Luís', fase: 'Sentença', valor: 85000, resp: adv, tags: 'Horas extras', col: 3 });
    const p3 = proc({ cnj: null, titulo: 'Revisão de contrato de fornecimento', cliente: c3, contra: 'Moinho Central Ltda.', area: 'Empresarial', tribunal: null, vara: null, comarca: 'Belo Horizonte', fase: 'Consultivo', valor: null, resp: eu, tags: 'Contratos', col: 0 });
    const p4 = proc({ cnj: cnj(5008910, ano, 8, 19, 1), titulo: 'Divórcio consensual com partilha', cliente: c4, contra: '—', area: 'Família', tribunal: 'TJRJ', vara: '2ª Vara de Família', comarca: 'Rio de Janeiro', fase: 'Inicial', valor: 450000, resp: adv, tags: 'Partilha', col: 2 });
    const p5 = proc({ cnj: cnj(7001122, ano - 2, 4, 4, 7000), titulo: 'Execução fiscal — defesa em embargos', cliente: c5, contra: 'União Federal (Fazenda Nacional)', area: 'Tributário', tribunal: 'TRF-4', vara: '2ª Vara Federal', comarca: 'Curitiba', fase: 'Recurso', valor: 1250000, resp: eu, tags: 'Alto valor,Recurso', col: 1 });
    const p6 = proc({ cnj: cnj(3009876, ano - 3, 4, 3, 6100), titulo: 'Concessão de aposentadoria por idade', cliente: c2, contra: 'INSS', area: 'Previdenciário', tribunal: 'TRF-3', vara: 'JEF Previdenciário', comarca: 'São Paulo', fase: 'Execução', valor: 62000, resp: adv, tags: 'INSS', col: 4, status: 'Encerrado' });

    const and = (p, d, t) => q('INSERT INTO andamentos (processo_id, data, descricao, criado_por) VALUES (?,?,?,?)').run(p, dia(d), t, eu);
    and(p1, -60, 'Petição inicial distribuída.'); and(p1, -40, 'Citação do réu realizada.'); and(p1, -10, 'Contestação juntada pelo réu. Prazo para réplica aberto.');
    and(p2, -90, 'Audiência inicial: conciliação recusada.'); and(p2, -5, 'Sentença publicada: procedência parcial.');
    and(p4, -3, 'Petição de divórcio consensual protocolada.');
    and(p5, -20, 'Embargos rejeitados em 1º grau. Apelação a interpor.');

    const pz = (t, tipo, p, resp, venc, prio, status = 'Pendente') => q('INSERT INTO prazos (escritorio_id, titulo, tipo, processo_id, responsavel_id, vencimento, prioridade, status) VALUES (?,?,?,?,?,?,?,?)')
      .run(e, t, tipo, p, resp, venc, prio, status);
    pz('Réplica à contestação', 'Prazo processual', p1, eu, calcularPrazo(dia(-10), 15, feriados).vencimento, 'Fatal');
    pz('Recurso ordinário', 'Prazo processual', p2, adv, calcularPrazo(dia(-5), 8, feriados).vencimento, 'Fatal');
    pz('Apelação nos embargos', 'Prazo processual', p5, eu, dia(0), 'Alta');
    pz('Enviar minuta revisada ao cliente', 'Tarefa interna', p3, eu, dia(1), 'Média');
    pz('Juntar certidão de casamento atualizada', 'Tarefa interna', p4, est, dia(-2), 'Alta');
    pz('Conferir cálculos de liquidação', 'Tarefa interna', p6, adv, dia(-15), 'Baixa', 'Concluído');

    const ev = (t, tipo, ini, fim, local, p, c, resp) => q('INSERT INTO eventos (escritorio_id, titulo, tipo, inicio, fim, local, processo_id, cliente_id, responsavel_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(e, t, tipo, ini, fim, local, p, c, resp);
    ev('Reunião com Mariana Costa', 'Reunião', dia(0, '10:00'), dia(0, '11:00'), 'Escritório — sala 2', p1, c1, eu);
    ev('Audiência de instrução', 'Audiência', dia(3, '14:00'), dia(3, '15:30'), 'Fórum João Mendes — 3ª Vara Cível', p1, c1, eu);
    ev('Atendimento Padaria Pão Dourado', 'Reunião', dia(1, '16:00'), dia(1, '17:00'), 'Videochamada', p3, c3, eu);
    ev('Audiência de conciliação — divórcio', 'Audiência', dia(8, '09:30'), dia(8, '10:30'), 'CEJUSC — Centro', p4, c4, adv);
    ev('Despacho com o juiz', 'Compromisso', dia(5, '13:00'), null, 'TRF-4', p5, c5, eu);

    const lanc = (tipo, cat, desc, valor, venc, pago, forma, c, p, parcela, total, grupo) => q(`INSERT INTO lancamentos (escritorio_id, tipo, categoria, descricao, valor, vencimento, pago_em, forma_pagamento, cliente_id, processo_id, parcela, total_parcelas, grupo, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e, tipo, cat, desc, valor, venc, pago, forma, c, p, parcela, total, grupo, eu);
    const mes = (n, d = 10) => iso(new Date(hoje.getFullYear(), hoje.getMonth() + n, d));
    for (let i = 0; i < 6; i++) {
      const venc = mes(i - 3);
      lanc('receita', 'Honorários contratuais', 'Honorários — indenização Mariana', 1500, venc, i <= 3 ? venc : null, 'Pix', c1, p1, i + 1, 6, 'demo-g1');
    }
    for (let i = 0; i < 4; i++) {
      const venc = mes(i - 2, 5);
      lanc('receita', 'Honorários contratuais', 'Honorários — contrato TechNova', 4800, venc, i < 1 ? venc : null, 'Boleto', c5, p5, i + 1, 4, 'demo-g2');
    }
    lanc('receita', 'Consultas', 'Consulta inicial — Padaria Pão Dourado', 600, mes(-1, 18), mes(-1, 18), 'Cartão', c3, p3, null, null, null);
    lanc('receita', 'Honorários de êxito', 'Êxito — aposentadoria (30% atrasados)', 7400, mes(-4, 22), mes(-4, 24), 'Transferência', c2, p6, null, null, null);
    lanc('receita', 'Honorários contratuais', 'Entrada — divórcio consensual', 3000, mes(0, 25), null, 'Pix', c4, p4, null, null, null);
    for (let i = -5; i <= 0; i++) {
      lanc('despesa', 'Despesas do escritório', 'Aluguel da sala', 2200, mes(i, 5), i < 0 || hoje.getDate() >= 5 ? mes(i, 5) : null, 'Transferência', null, null, null, null, null);
      lanc('despesa', 'Despesas do escritório', 'Software, internet e telefone', 380, mes(i, 12), i < 0 || hoje.getDate() >= 12 ? mes(i, 12) : null, 'Cartão', null, null, null, null, null);
    }
    lanc('despesa', 'Custas processuais', 'Preparo da apelação — TRF-4', 1150.4, dia(0), null, 'Boleto', c5, p5, null, null, null);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { mensagem: 'Dados de demonstração carregados: 5 clientes, 6 processos, prazos, agenda e financeiro.' };
}
