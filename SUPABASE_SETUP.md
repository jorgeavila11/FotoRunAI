# FotoRun AI — Configurando o Supabase (Passo 1)

Tempo estimado: 15 minutos.

## 1. Criar o projeto no Supabase

1. Entre em https://supabase.com e crie uma conta (pode usar o Google).
2. Clique em **New project**.
   - **Name:** `fotorun`
   - **Database Password:** crie uma senha forte e guarde-a.
   - **Region:** `South America (São Paulo)`, que é mais rápida para o Brasil.
3. Espere uns 2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/migrations/0001_init.sql`, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer "Success. No rows returned".

Isso cria as tabelas (perfis, eventos, fotos, pedidos, saques, cupons), as regras de segurança, os 2 locais de armazenamento de fotos e os 4 eventos de exemplo.

## 3. Copiar as chaves para o `.env`

1. Abra **Project Settings > API** (ou **Data API** / **API Keys**).
2. Na pasta do projeto, copie `.env.example` para um novo arquivo chamado `.env`.
3. Preencha:

| No `.env` | Onde encontrar no Supabase |
|---|---|
| `VITE_SUPABASE_URL` e `SUPABASE_URL` | **Project URL** (o mesmo valor nos dois) |
| `VITE_SUPABASE_ANON_KEY` | chave **anon / public** |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **service_role / secret**. É secreta: nunca a coloque no site nem a compartilhe |
| `GEMINI_API_KEY` | sua chave do Google AI Studio |

## 4. Configurar o login

1. Abra **Authentication > URL Configuration**.
   - **Site URL:** `http://localhost:3000` (quando publicar o site, troque pelo endereço real).
2. Em **Authentication > Sign In / Providers > Email**, a opção **Confirm email** vem ligada. Isso é o recomendado: a pessoa recebe um link para confirmar o e-mail antes de entrar.
   - O servidor de e-mail gratuito do Supabase envia **poucos e-mails por hora**. Para testar à vontade, desligue o Confirm email temporariamente. Antes de lançar, ligue de novo e configure um SMTP próprio, como Resend ou Brevo, em **Authentication > Emails > SMTP Settings**.

## 5. Rodar o projeto

No terminal, dentro da pasta do projeto:

```bash
npm install
npm run seed      # cria o fotógrafo de demonstração e envia as fotos de exemplo
npm run dev       # abre em http://localhost:3000
```

O `npm run seed` mostra no terminal o **e-mail e a senha do fotógrafo demo**. Anote, porque a senha só aparece na primeira vez.

## 6. Testar

1. **Fotógrafo:** entre com o usuário demo, vá ao **Painel do Fotógrafo** e envie algumas fotos. Elas aparecem na galeria com a marca d'água gravada.
2. **Atleta:** saia da conta, crie uma conta de atleta com outro e-mail, faça uma busca por selfie ou por número de peito e compre uma foto.
3. Em **Minhas Fotos**, baixe o original sem marca d'água.
4. Teste a proteção: na galeria, abra uma foto em nova aba. O endereço é a prévia pequena com marca d'água, não o original.

No Supabase, em **Table Editor**, você vê os dados reais: `profiles`, `photos`, `orders` e as outras tabelas.

## O que mudou em relação ao app do AI Studio

- **Login real** com e-mail e senha, confirmação de e-mail e "esqueci minha senha".
- **Banco de dados**: nada mais some quando o servidor reinicia.
- **Cada fotógrafo tem sua conta**, com preço, marca d'água, vendas e saldo próprios.
- **Fotos protegidas**: o original fica num armazenamento privado. O público só vê uma prévia de 1200 px com a marca d'água gravada na imagem. O original só é liberado por link temporário (1 hora) para quem comprou.
- **Rotas do servidor protegidas**: enviar fotos, mudar preço, comprar e sacar exigem login. As de fotógrafo exigem conta de fotógrafo.
- **Preço calculado no servidor**, com cupons vindos do banco (tabela `coupons`).
- **LGPD**: o aceite dos termos precisa ser marcado pela pessoa e fica registrado com data (`terms_accepted_at`). A selfie da busca facial não é gravada.
- **Confiança da busca facial** agora é a nota real da IA, sem ser forçada para cima.

## O que continua simulado (próximos passos)

- **Pagamento (Passo 3):** o checkout ainda não cobra. O pedido é marcado como pago na hora e a tela mostra "MODO DE TESTE".
- **Saque (Passo 3):** o pedido de saque fica registrado como `solicitado` na tabela `payouts`, mas o Pix não é enviado automaticamente.
- **Busca facial em escala (Passo 4):** ainda compara a selfie com no máximo as 14 fotos mais recentes do evento.
- **Cadastro de eventos:** ainda não há tela para criar eventos. Por enquanto, crie pelo **Table Editor > events**. O `owner_id` é o fotógrafo que administra o evento e pode mudar o preço do pacote.
- **Tempo oficial da prova** (tela de downloads): aparece como `--:--:--` até haver integração com a cronometragem.

## Observações

- A marca d'água nova só vale para as fotos enviadas **depois** da mudança. As prévias antigas mantêm a marca d'água anterior.
- O arquivo `bun.lock` ficou desatualizado. Se você usa `npm`, pode apagá-lo, porque o `package-lock.json` substitui.
- No AI Studio, as variáveis do `.env` são cadastradas no painel **Secrets**.

---

# Passo 4 — Reconhecimento facial gratuito (YuNet + SFace)

A busca por selfie agora usa reconhecimento facial de verdade, rodando no próprio servidor, sem custo por uso.

- **YuNet** encontra todos os rostos de cada foto, inclusive os pequenos ao fundo.
- **SFace** transforma cada rosto em uma "impressão digital" de 128 números.
- O Supabase compara a selfie com todas as impressões do evento em menos de 1 segundo, sem limite de fotos.
- Os modelos são do OpenCV Zoo, com licença Apache-2.0, que permite uso comercial.
- O Gemini continua sendo usado só para ler o número de peito.

## Ativar

1. No Supabase, abra **SQL Editor > New query**, cole todo o conteúdo de `supabase/migrations/0003_faces.sql` e clique em **Run**.
2. No terminal, dentro da pasta do projeto:
   ```bash
   npm install
   npm run models:download   # só é necessário se a pasta models/ estiver vazia
   npm run faces:reindex     # analisa os rostos das fotos que já estavam no banco
   npm run dev
   ```

As fotos novas são analisadas automaticamente no envio.

## Ajustar a precisão

Para testar com arquivos do seu computador, sem mexer no banco:

```bash
npm run faces:test -- minha-selfie.jpg foto1.jpg foto2.jpg
```

O comando mostra a semelhança (de 0 a 1) entre a selfie e o rosto mais parecido de cada foto.

- **Fotos de outras pessoas aparecendo na busca:** aumente o limiar no `.env`, por exemplo `FACE_MATCH_THRESHOLD=0.40`.
- **Fotos suas ficando de fora:** diminua o limiar, por exemplo `FACE_MATCH_THRESHOLD=0.32`.

O valor padrão é **0,36**, a referência do SFace. Rostos pequenos, com menos de 64 px, precisam de 0,09 a mais de semelhança, porque a "impressão digital" deles é menos confiável.

## Limitações

- Óculos escuros, boné cobrindo os olhos, rosto de perfil ou rosto muito pequeno reduzem a semelhança. Nesses casos, a busca por número de peito complementa.
- Para mais precisão no futuro, dá para trocar só o arquivo `server/faces.ts` por um serviço pago, como o Amazon Rekognition, sem mudar o resto do sistema.

---

# Painel do fotógrafo (Bloco 1)

O painel do fotógrafo ganhou:

- **Seus ganhos:** valores de hoje, dos últimos 7 dias, do mês e desde o começo, com o saldo disponível para saque.
- **Desempenho mensal:** gráfico dos últimos 12 meses, com opção de comparar com o ano anterior e de ver em tabela.
- **Vendas por ponto do percurso:** mostra em que ponto da prova as fotos mais vendem e a taxa de conversão de cada ponto.
- **Solicitar evento:** o fotógrafo pede a inclusão de uma prova. O administrador vê o pedido em **Administração** e aprova, com o formulário já preenchido, ou recusa, informando o motivo.
- **Cadastro inicial:** quatro perguntas no primeiro acesso: perfil, experiência, cidade e objetivos.

## Ativar

No Supabase, abra **SQL Editor > New query**, cole todo o conteúdo de `supabase/migrations/0004_painel_fotografo.sql` e clique em **Run**.

---

# Categorias de evento

Cada evento agora tem uma **categoria**: corrida de rua (o padrão), trail, ciclismo, MTB, triatlo, natação, caminhada, outros esportes ou passeios e turismo.

- Os eventos que já existiam ficam automaticamente como **corrida de rua**. Nada muda para eles.
- Em categorias **sem número de peito**, como passeios e turismo:
  - a galeria esconde a busca por número;
  - o servidor não chama o Gemini para ler números (economiza uso da IA);
  - os textos se adaptam, por exemplo "Local do passeio" no lugar de "Ponto do percurso".
- A lista de categorias fica em `src/data/categories.ts`. Para criar uma nova, adicione-a nesse arquivo e na regra (constraint) da coluna `category` no banco.

## Ativar

No Supabase, abra **SQL Editor > New query**, cole todo o conteúdo de `supabase/migrations/0005_categorias.sql` e clique em **Run**.

---

## Passo 9 — Prazos de guarda das fotos (LGPD)

1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0006_retencao_lgpd.sql` e clique em **Run** (depois da 0004 e da 0005).
2. Pronto. As regras passam a valer assim:

| O quê | Prazo padrão | Onde muda |
|---|---|---|
| Impressões faciais (busca por selfie) | 6 meses após o evento | Administração → Editar evento → "Prazos de guarda (LGPD)" |
| Fotos não vendidas | 12 meses após o evento | Mesmo lugar |
| Download das fotos compradas | 12 meses após a compra | Variável `DOWNLOAD_RETENTION_MONTHS` no Render (opcional) |

- Fotos que alguém comprou **não são apagadas** enquanto o comprador ainda pode baixá-las.
- A limpeza roda sozinha 1 minuto depois que o servidor liga e depois a cada 24 h. No Render grátis o servidor "dorme" sem visitas; ao acordar, a limpeza roda de novo — então nada fica esquecido.
- Para desligar a limpeza automática: variável `RETENTION_ENABLED=false`.
- Para ver o que seria apagado sem apagar nada: `npm run retention:run -- --dry-run`. Para rodar na hora: `npm run retention:run`.

**Remover minhas fotos:** no rodapé do site e na busca facial existe o botão "Remover minhas fotos". O atleta entra na conta, envia uma selfie e as fotos dele saem na hora da vitrine e da busca. O pedido aparece no topo de **Administração**, onde você confirma a exclusão definitiva ou restaura (se for engano).

---

## Passo 10 — Conta de recebimento e Taxas e serviços

1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0007_conta_recebimento.sql` e clique em **Run** (depois da 0006).
2. Como funciona:
   - O fotógrafo abre **Painel → Conta de recebimento** e preenche 3 etapas: dados do titular, chave Pix (e conta bancária, opcional) e confirmação.
   - A conta entra **em análise**. Em **Administração** aparece "Contas de recebimento para aprovar". Dica: faça um Pix de R$ 0,01 para a chave e confira se o nome do titular bate antes de aprovar.
   - O fotógrafo pode vender normalmente enquanto isso; o **saque só é liberado com a conta aprovada**.
   - Se ele trocar chave Pix, CPF/CNPJ ou banco, a conta volta para análise (proteção contra desvio de repasses).
   - Os saques pedidos aparecem em **Administração → Saques a pagar**. Faça o Pix pelo app do banco e clique em "Marquei como pago". (Quando o Pix automático for ligado, isso deixa de ser manual.)
3. Página pública **Taxas e serviços** (link no rodapé): mostra os valores reais que o sistema usa.
4. Variáveis opcionais no Render:

| Variável | Padrão | O que faz |
|---|---|---|
| `PLATFORM_FEE_PERCENT` | `15` | Taxa da plataforma sobre cada venda. Muda a página de taxas, o painel e o cálculo. Vendas antigas não mudam. |
| `PAYOUT_BUSINESS_DAYS` | `2` | Prazo prometido para o saque cair na conta. |
| `MIN_PAYOUT` | `0` | Valor mínimo para pedir saque (em reais). |

---

## Passo 11 — Painel de administração

1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0008_admin_plataforma.sql` e clique em **Run** (depois da 0007).
2. Entre com a conta de administrador e clique em **Administração**. Abas:
   - **Visão geral:** receita da FotoRun, vendas totais, pedidos, fotos vendidas, repasses, gráficos de vendas e de cadastros por mês, eventos e fotógrafos que mais venderam, e as pendências do dia.
   - **Eventos:** criar, editar, aprovar ou recusar pedidos de fotógrafos, **desativar** e **reativar** eventos.
     Evento desativado some da vitrine e da busca, não aceita fotos nem compras; quem já comprou continua baixando.
   - **Fotógrafos** e **Usuários:** busca, filtros, ordenação, exportar planilha (CSV) e **suspender/reativar** conta.
     Conta suspensa não consegue entrar; as fotos de fotógrafo suspenso saem da vitrine (nada é apagado).
   - **Financeiro:** saques a pagar e contas de recebimento para aprovar.
   - **LGPD:** pedidos "Remover minhas fotos".
