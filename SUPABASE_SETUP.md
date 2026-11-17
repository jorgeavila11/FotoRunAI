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
