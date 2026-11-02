# GRAÇA | Gente, Moda e Comunidade

Loja demonstrativa da GRAÇA GMC com catálogo, sacola, área de cliente e painel administrativo.

**Site ao vivo:** https://graca-454ff.web.app

O site está publicado no Firebase Hosting. As rotas de pagamento dependem da publicação das Cloud Functions e da configuração segura das credenciais do Mercado Pago; o Firebase exige o plano Blaze para publicar essas funções.

## Abrir a prévia

Na pasta do projeto, execute `npm run dev` e abra `http://localhost:5501`. O servidor local entrega o site e encaminha `/api/mercadopago/config` e `/api/mercadopago/order` ao Firebase pelo servidor, evitando CORS no navegador. O Live Server comum não configura esse proxy; nesse caso, use a porta e o endereço mostrados pelo servidor deste projeto. Para operações de login OAuth, `localhost` também precisa estar autorizado no Firebase Authentication.

## Login e acesso administrativo

- O login e o cadastro usam Firebase Authentication com e-mail e senha.
- O cadastro pede uma senha e envia um link de confirmação. O cliente precisa confirmar o e-mail antes de acessar a conta, a Comunidade VIP ou o checkout.
- A recuperação usa o link seguro de redefinição de senha do Firebase.
- O painel administrativo aceita contas verificadas com a custom claim `admin: true` ou com um documento autorizado em Firestore. Para autorizar pelo documento, abra `Firestore Database → admins → Adicionar documento`, use como ID o UID exato exibido no Firebase Authentication e salve. O documento pode ficar sem campos. Somente o Console do Firebase pode criar ou remover documentos dessa coleção; clientes não podem conceder a si mesmos o acesso.
- Ative o provedor **E-mail/senha** no Firebase Authentication e autorize `localhost`, `127.0.0.1` e o domínio publicado em **Authentication → Settings → Authorized domains**.

## Mercado Pago

O checkout usa **Checkout Transparente com a Orders API**. O Card Payment Brick captura e tokeniza cartões; o Pix é criado como order no servidor e a tela da loja apresenta QR Code e Pix Copia e Cola. O status é acompanhado pelo documento da order no Firestore, atualizado somente depois da validação do Webhook. O backend HTTPS está em `functions/index.js`, com Firebase Functions, validação de usuário, cálculo de valores no servidor, reserva de estoque, idempotência e conferência HMAC.

A Orders API é a opção recomendada atualmente para Checkout Transparente. O **Status Screen Brick oficial** exige um ID da Payments API, que o painel já sinaliza como legada e próxima de ser descontinuada; por isso a tela de status deste projeto é própria e acompanha os estados da Orders API.

Antes de liberar cobranças:

1. Crie a aplicação como **Checkout Transparente** e selecione **API de Orders**. O conteúdo da documentação enviado na conversa contém exemplos mascarados, não credenciais utilizáveis.
2. Ative o plano Blaze se o projeto ainda estiver no plano Spark. Cloud Functions e o Secret Manager precisam estar disponíveis para publicar o backend e guardar as credenciais.
3. O Firestore padrão do projeto já existe (edição Standard, região `nam5`) e está vazio. Cadastre `products/{id}` com `name`, `active`, `price`, `cost`, `discount`, `stock`, `reservedStock` e `sizes`. Para cupons, use `coupons/{CODIGO}` com `active`, `value`, `maxUses`, `uses` e `reservedUses`.
4. O backend usa o OAuth `client_credentials` para solicitar um Access Token para a própria aplicação. Ele envia somente `client_id`, `client_secret`, `grant_type` e, no modo de teste, `test_token: "true"`. `code`, `code_verifier`, `redirect_uri` e `refresh_token` pertencem a outros grants e não entram nessa requisição. O token fica em memória no servidor e é renovado conforme o `expires_in` retornado pelo Mercado Pago. Os segredos nunca são enviados ao navegador. Cadastre o Client ID, Client Secret da aplicação e a assinatura secreta de Webhook digitando-os diretamente nos prompts locais:

   ```powershell
   firebase functions:secrets:set MP_CLIENT_ID --project graca-454ff
   firebase functions:secrets:set MP_CLIENT_SECRET --project graca-454ff
   firebase functions:secrets:set MP_WEBHOOK_SECRET --project graca-454ff
   ```

   Para manter os testes, `MP_TEST_MODE` começa como `true`. Para produção, crie `functions/.env.graca-454ff` com `MP_TEST_MODE=false` e use as credenciais de produção. Não inclua esse arquivo no Git.
5. Cadastre no painel do Mercado Pago o Webhook `https://graca-454ff.web.app/api/mercadopago/webhook` e habilite o evento **Order (Mercado Pago)**.
6. A função autenticada `/api/mercadopago/config` obtém a Public Key da resposta OAuth e devolve somente essa chave pública ao comprador conectado. As rotas de configuração, criação de orders e Webhook ficam em `/api/mercadopago/config`, `/api/mercadopago/order` e `/api/mercadopago/webhook`.
7. Depois de cadastrar os três segredos, publique regras, funções e hospedagem com Firebase CLI: `firebase deploy --only firestore:rules,functions,hosting --project graca-454ff`. Faça compras de teste em HTTPS antes de habilitar credenciais de produção.

O projeto contém o cliente dos Bricks, o OAuth de servidor, as Cloud Functions e a conexão de projeto para o MCP do Mercado Pago, mas depende do cadastro de credenciais reais, de catálogo no Firestore, da publicação das funções e da configuração do Webhook.

## Painel de análises

A aba **Análises** oferece filtro por período, faturamento de pedidos marcados como pagos, ticket médio, divisão por Pix/cartão, desempenho dos produtos, margem registrada, buscas locais, clientes sem compra nos últimos 45 dias e exportação de três arquivos CSV compatíveis com Excel. A tela ainda lê `localStorage`; os pedidos criados pelo backend ficam no Firestore, então é necessária uma migração da origem dos dados antes de usar os relatórios como painel de produção.

O editor de produtos inclui custo de aquisição para calcular a margem das novas vendas. Pedidos antigos sem esse custo aparecem sem margem histórica calculada.

## Dados e limitações atuais

- Catálogo, clientes, comentários, buscas e relatórios ainda usam `localStorage` neste protótipo. Os pagamentos e pedidos criados pelo backend usam o Firestore, mas ainda não são sincronizados de volta ao painel administrativo local.
- Autenticação e senha são verificadas pelo Firebase Authentication; a senha nunca é salva no site.
- Os relatórios são uma prévia operacional local, não um livro fiscal. Em produção, o webhook assinado deve ser a fonte confiável para confirmação de pagamento.
- Pedidos e clientes não têm ação para exclusão definitiva. Um pedido pode ser cancelado mudando o status.
- Não use dados reais de compradores até confirmar a instância e localização do Firestore, definir regras de segurança, migrar a loja/painel para dados compartilhados, implantar o backend e configurar a política de privacidade.

## Estrutura

- `index.html`: estrutura da loja e carregamento dos SDKs.
- `style.css`: identidade visual e responsividade.
- `app.js`: catálogo, autenticação, checkout e painel local.
- `firebase.js`: inicialização do app web Firebase existente (`graca-454ff`).
- `firestore.rules`: acesso de clientes e administradores; pedidos e clientes não podem ser apagados pelo cliente web.
- `payment-config.js`: URLs públicas das Cloud Functions do Mercado Pago; a Public Key é obtida com segurança pelo endpoint de configuração após o login.
- `payments.js`: integração do Card Payment Brick e envio de orders Pix.
- `functions/index.js`: criação segura de pagamento, reserva de estoque e recebimento/validação de Webhooks.
- `assets/`: mídia editorial.
