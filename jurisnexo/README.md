# JurisNexo

Sistema de gestão para escritórios de advocacia: clientes, processos, Kanban, prazos em dias úteis, agenda, financeiro e equipe com papéis.

## Como usar no Windows

1. Instale o **Node.js 22 LTS** (versão 22.13 ou mais nova): https://nodejs.org. Use o instalador padrão e clique em "Next" até o fim.
2. Baixe esta pasta `jurisnexo`.
3. Dê dois cliques em **`iniciar-windows.bat`**.
   - Na primeira vez, ele instala as dependências e gera as telas. Isso leva 1 a 2 minutos.
4. O navegador abre em **http://localhost:3000**. Se não abrir, digite o endereço manualmente.
5. Clique em **Criar conta do escritório**.
6. Para testar com exemplos, vá em **Configurações → Dados de demonstração**.

Para desligar, feche a janela preta do terminal.

### Pelo terminal (Windows, Mac ou Linux)

```bash
npm install
npm run build
npm start
```

Para desenvolvimento, use dois terminais: `npm run dev:api` e `npm run dev:web` (http://localhost:5173).

## Onde ficam os dados

Os dados ficam na pasta `dados/`: o banco `jurisnexo.db` e os documentos enviados.

- **Backup:** copie essa pasta inteira para um lugar seguro.
- **Outro local:** para guardar os dados em outro lugar, defina a variável `JURISNEXO_DATA`.
- **Outra porta:** para usar outra porta, defina `PORT`.

## Funções

| Módulo | O que faz |
|---|---|
| **Painel** | Processos ativos, prazos de hoje, dos próximos 7 dias e atrasados, compromissos do dia, valores recebidos, a receber e em atraso, e gráfico de 6 meses |
| **Clientes** | Pessoa física ou jurídica, validação de CPF/CNPJ, máscaras, busca de endereço pelo CEP (ViaCEP), link para o WhatsApp |
| **Processos** | Número CNJ com conferência do dígito verificador, área, fase, etiquetas e responsável. Abas de andamentos (linha do tempo), prazos, documentos (envio e download), financeiro, anotações e histórico de alterações |
| **Kanban** | Arrastar e soltar entre colunas configuráveis, filtros e próximo prazo em cada cartão. No celular, a coluna muda pelo seletor do cartão |
| **Prazos** | Tipos, prioridades e responsáveis. Calculadora em dias úteis (art. 219 do CPC) que pula fins de semana e feriados |
| **Agenda** | Visões de mês, semana e dia, com audiências, reuniões, prazos e feriados, e filtro por advogado |
| **Financeiro** | Receitas e despesas, parcelamento com o total exato, registro de pagamento, filtros, totais e exportação CSV (abre no Excel) |
| **Configurações** | Dados do escritório, equipe (convite por link, papéis, desativação), colunas do Kanban, etiquetas, feriados e dados de demonstração |

**Outros recursos:**
- Busca global
- Sininho com prazos que vencem em até 2 dias
- Modo escuro
- Layout para celular

### Portal do cliente

O cliente entra em **/portal/entrar** com o e-mail e uma senha própria. No portal, ele:
- vê os próprios processos;
- vê os andamentos marcados como visíveis;
- vê as próximas audiências e os pagamentos;
- baixa os documentos compartilhados e envia documentos;
- conversa com o escritório pelo chat.

**Para liberar o acesso:**
1. Abra a ficha do cliente, que precisa ter e-mail.
2. No cartão **Portal do cliente**, clique em **Liberar acesso**.
3. Envie o link ao cliente; também dá para enviar pelo WhatsApp com um clique.
4. O cliente cria a senha e entra.

O link vale para um único acesso. Se o cliente esquecer a senha, gere um novo link.

**O que o cliente vê:**
- **Andamentos:** começam visíveis. Desmarque **Visível para o cliente** no formulário, ou clique no ícone de olho, para mantê-los internos.
- **Documentos:** começam internos. Marque **Compartilhar com o cliente** ao enviar, ou use o ícone de compartilhar.
- **Documentos enviados pelo cliente:** aparecem no processo e geram um aviso em **Mensagens**.

O menu **Mensagens** mostra quantas mensagens ainda não foram lidas. As conversas se atualizam sozinhas a cada poucos segundos. **Desligar** o portal tira o acesso do cliente na hora.

Os dados de demonstração já liberam o portal da cliente fictícia **Mariana**. O e-mail e a senha dela aparecem na tela de Configurações depois que os dados são carregados.

### Papéis

| Papel | Acesso |
|---|---|
| **Administrador** | Tudo, incluindo equipe e configurações |
| **Advogado** | Tudo, exceto alterar equipe e configurações |
| **Estagiário/Assistente** | Não vê o Financeiro nem valores no Painel |

Cada escritório só vê os próprios dados.

### Convidar alguém

1. Vá em **Configurações → Equipe → Convidar**.
2. Copie o link gerado e envie para a pessoa.
3. A pessoa cria a senha e entra direto no escritório.

O sistema ainda não envia e-mails.

## Próximas etapas (não incluídas)

- App nativo (Android/iOS) para o cliente
- IA para prazos e resumos
- WhatsApp
- Assinatura digital
- Cobrança automática (Pix/boleto)
- Consulta automática aos tribunais
- Publicação na internet com domínio e HTTPS

## Testes

```bash
npm test
```

O teste cobre o fluxo completo da API:
- Validações
- Cálculo de prazo com feriado
- Portal do cliente: acesso, privacidade de andamentos e documentos, mensagens, desligamento
- Parcelamento
- Bloqueio do estagiário no Financeiro
- Isolamento entre escritórios
