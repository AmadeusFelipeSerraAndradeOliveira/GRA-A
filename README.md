# GRAÇA | Gente, Moda e Comunidade

Loja de moda com catálogo e painel administrativo em Firestore, reservas sem cobrança e fotos hospedadas no Cloudinary.

## Plano Firebase

O site usa Hosting, Authentication e Firestore. O projeto não precisa de Cloud Functions, Secret Manager, Storage ou plano Blaze para os fluxos documentados aqui. O Hosting local é um servidor estático; as gravações vão direto do navegador ao Firestore com validação pelas regras publicadas.

As reservas são solicitações, não compras pagas. A loja confere disponibilidade e estoque no painel; o estoque só muda quando uma pessoa administradora confirma. Pagamentos Mercado Pago via API não estão ativos nesta versão sem backend.

## Executar no computador

```powershell
npm install
npm run dev
```

Abra `http://127.0.0.1:5501`. `npm run build` verifica a sintaxe, confirma os pontos principais e sincroniza `index.html`, JavaScript, CSS e imagens na pasta `public/`.

No Firebase Authentication, habilite **Anonymous** e **Email/Password**. Confirme o e-mail da conta de administração e confira que o UID dela está em `admins/{uid}`. Para acessar o painel, use essa mesma conta.

## Reservas e mensagens

Os formulários enviam dados diretamente ao Firestore em uma operação atômica. As regras validam os campos, os produtos, o preço vigente e o status inicial. Reservas exigem intervalo de 30 segundos por WhatsApp e por identificador aleatório persistido no navegador; contatos exigem intervalo por e-mail e pelo mesmo identificador. Assim, abrir outra sessão anônima ou trocar somente telefone/e-mail no mesmo navegador não reinicia o limite. Comentários confirmados têm intervalo por conta. O navegador também mantém um limite local para evitar envios repetidos por engano.

Esses limites independentes reduzem o abuso por troca de um único identificador. O Firebase Spark não executa código servidor, então eles não são um limite global confiável por endereço de rede: alguém que crie novas sessões anônimas e também troque o telefone/e-mail ainda pode enviar novas solicitações. Um limite rígido por IP exige mover as gravações públicas para um backend confiável e negar as gravações diretas no Firestore.

## Fotos no Cloudinary

O painel envia arquivos JPEG, PNG e WebP de até 5 MB, ou importa um link HTTPS, por meio do Cloudflare Worker autenticado. O Worker confere o token Firebase, confirma o acesso administrativo, valida o conteúdo e assina o envio ao Cloudinary. O produto grava somente `secure_url` e `public_id` devolvidos pelo serviço. O site não contém o segredo da API nem um preset de upload público.

Para habilitar, publique `cloudinary-worker` seguindo `cloudinary-worker/README.md` e guarde `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` como segredos do Worker. Depois, abra **Produtos → Configurar upload** e salve a URL HTTPS workers.dev retornada pela publicação. Desative o preset antigo `graca_products_unsigned_v1` no Cloudinary; ele não é mais chamado pelo site. Se a API Secret que foi compartilhada anteriormente ainda estiver ativa, gere uma nova no Cloudinary antes de salvar no Worker.

Depois de publicar o Worker, abra **Produtos → Configurar upload** no painel, salve a URL HTTPS do Worker, selecione arquivos ou cole URLs HTTPS e importe. URLs privadas, com login ou que bloqueiam buscas automatizadas podem ser recusadas pelo Cloudinary.

## WhatsApp e avisos de novas reservas

As reservas novas aparecem em tempo real quando o painel administrativo está aberto. Também foi preparada uma inscrição de push com OneSignal: depois de publicar o Worker descrito abaixo, clique em **Visão Geral → Ativar avisos em segundo plano** em cada aparelho administrativo. O app OneSignal da GRAÇA já foi criado e o site `https://gracaoficial.com` foi cadastrado nele. O serviço usa um Worker gratuito fora do Firebase para enviar o push e o OneSignal para entregá-lo ao navegador; o segredo da API fica no Cloudflare, nunca no site.

### Ativar notificações fora do navegador

O aplicativo OneSignal atual aceita inscrições somente em `https://gracaoficial.com`. Em outros endereços (incluindo `web.app`, `firebaseapp.com` e ambiente local), o botão abre esse painel para concluir a ativação; entre novamente na conta administrativa se necessário. `push-config.js` registra esse endereço em `oneSignalOrigin`. Permitir uma origem no Worker não altera a origem aceita pelo OneSignal. Para usar outro domínio, configure um aplicativo OneSignal para ele e ajuste também os IDs e as origens do serviço de avisos.

O SDK inicializa uma única vez por página, inclusive quando o painel é aberto várias vezes. Se a inicialização falhar, recarregue a página; uma falha no download do script permite tentar novamente. Valide a integração local com `node --test scripts/admin-push-test.cjs`.

No Android, abra `https://gracaoficial.com/#admin` diretamente no Chrome normal. O painel prepara o SDK antes de liberar o botão; a solicitação de permissão usa essa instância pronta no próprio toque. A inscrição só é registrada no Worker depois de o OneSignal fornecer ID, token push e `optedIn: true`, com espera de até 45 segundos para essa confirmação. O progresso e os erros permanecem visíveis abaixo do botão. Caso a permissão esteja bloqueada, permita Notificações nas permissões do site e confira também as notificações do Chrome nas configurações do Android.

O envio ao OneSignal inclui `en` como idioma padrão obrigatório e `pt` como tradução, ambos com a mensagem em português. O Worker só registra o aviso como enviado após receber um ID de notificação não vazio; isso confirma a criação no OneSignal, não a entrega ao aparelho. Falhas HTTP e de conexão liberam a marca temporária para permitir nova tentativa dentro da janela do pedido. Uma resposta sem destinatários ativos não é apresentada como envio concluído. Os códigos `ONESIGNAL_INVALID_REQUEST`, `ONESIGNAL_AUTH_ERROR`, `ONESIGNAL_RATE_LIMIT` e `ONESIGNAL_UNAVAILABLE` distinguem falhas sem expor chaves ou IDs de destinatários ao cliente.

Execute `npm run test:push` para validar o navegador e o Worker com tokens RSA e serviços simulados, sem criar pedidos ou enviar notificações reais. Alterações em `cloudflare-push/src/index.js` precisam ser publicadas separadamente com `wrangler deploy` na pasta `cloudflare-push`; publicar somente o Firebase Hosting não atualiza esse serviço. O segredo `ONESIGNAL_REST_API_KEY` deve permanecer na Cloudflare.

1. O app OneSignal **GRAÇA GMC - Avisos administrativos** já está criado com Web Push para `https://gracaoficial.com`. O App ID público já está preenchido em `push-config.js` e `cloudflare-push/wrangler.toml`.
2. Entre em uma conta Cloudflare e abra um terminal na pasta `cloudflare-push`:

   ```powershell
   npm install
   npx wrangler login
   npx wrangler kv namespace create PUSH_STATE
   ```

3. Copie o `id` retornado para `cloudflare-push/wrangler.toml`, substituindo `CRIE_E_COLE_O_ID_DO_NAMESPACE_KV`.
4. Em **Settings → Keys & IDs** no OneSignal, crie/copie a chave REST da aplicação. Na pasta `cloudflare-push`, grave a chave como segredo e publique o Worker:

   ```powershell
   npx wrangler secret put ONESIGNAL_REST_API_KEY
   npm run deploy
   ```

   O terminal pede o segredo sem incluí-lo no projeto. Não cole a chave REST em `push-config.js`, `app.js`, no GitHub ou em mensagens.
5. Copie a URL HTTPS do Worker para `workerUrl` em `push-config.js`, execute `npm run build` na pasta principal e publique novamente o Hosting:

   ```powershell
   firebase deploy --only hosting --project graca-454ff
   ```

6. Abra o site no aparelho que receberá alertas, entre com a conta administrativa e ative os avisos. Permita as notificações do navegador. Faça isso em cada aparelho desejado.

A página de configuração do OneSignal deve usar a origem exata do site. O arquivo `OneSignalSDKWorker.js` já está na raiz pública. Para testar push local, crie uma aplicação separada no OneSignal para `http://127.0.0.1:5501` e adicione esse endereço em `ALLOWED_ORIGINS` no Worker.

O navegador não precisa estar aberto para exibir o push quando o aparelho está ligado, conectado à internet e o sistema permite notificações em segundo plano. Se o aparelho estiver desligado, sem rede ou com notificações bloqueadas, não há garantia de entrega imediata. No iPhone/iPad, o Web Push requer iOS/iPadOS 16.4 ou posterior e o site adicionado à Tela de Início. A OneSignal Free atualmente limita um envio a até 10.000 inscritos web; a Cloudflare Free tem limites diários de solicitações e armazenamento KV. Confira os limites atuais antes de crescer: [preços OneSignal](https://onesignal.com/pricing), [limites do Workers](https://developers.cloudflare.com/workers/platform/limits/) e [limites do Workers KV](https://developers.cloudflare.com/kv/platform/limits/).

A confirmação da reserva também oferece uma mensagem pronta para o WhatsApp administrativo `+55 63 99305-1964`; quem reservou ainda precisa tocar em **Enviar**. Uma mensagem automática pelo WhatsApp, sem clique do cliente, exige conta WhatsApp Business e credenciais no servidor; não usamos API não oficial.

Uma mensagem automática pelo WhatsApp, sem clique do cliente, não pode ser enviada só pelo site estático. A plataforma oficial exige uma conta de WhatsApp Business configurada, credenciais guardadas no servidor e os modelos/permissões aplicáveis; não usamos API não oficial.

## Publicação

1. Execute `npm run build`.
2. Publique as regras e o Hosting no projeto `graca-454ff`:

   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes,hosting --project graca-454ff
   ```

3. Adicione `localhost`, `127.0.0.1` e `amadeusfelipeserraandradeoliveira.github.io` em **Authentication → Settings → Authorized domains**, conforme os endereços usados.

## Dados principais

O painel **Clientes / VIP** apresenta uma tabela única, com busca por nome, e-mail, telefone e pedido; filtros Todos, VIP, Clientes e Passantes; ordenação e páginas de 12 registros. Conta e associação VIP do mesmo UID aparecem uma única vez, com as ações de ambas disponíveis em **Gerenciar**. Contas com UIDs distintos continuam separadas mesmo quando compartilham um contato. WhatsApp e os fluxos existentes de remoção VIP e exclusão de cadastro são preservados. A redefinição em lote fica em **Gestão de cadastros**, com as mesmas confirmações e cópia de segurança. Execute `npm run test:customers` para validar a composição e os filtros da tabela.

- `products` guarda catálogo, quantidades por tamanho e URLs do Cloudinary; `productCosts` mantém custo privado. Produtos antigos sem divisão por tamanho carregam o estoque total na primeira variação até a equipe informar os números reais.
- `orders` guarda solicitações e histórico. A redefinição completa do site pode apagá-los somente após gerar uma cópia JSON, confirmar a senha administrativa e digitar `REDEFINIR SITE`; os cadastros de clientes, contas Firebase e administradores são preservados. Esse fluxo não apaga as fotos armazenadas no Cloudinary.
- `customers` mantém fichas de cliente; ao excluir uma ficha pelo painel, a associação em `vipUsers` também é removida no mesmo lote. A ação **Redefinir perfis e VIPs** baixa uma cópia, exige senha e confirmação digitada, apaga as fichas e vínculos VIP, e mantém os logins do Firebase Authentication, pedidos e financeiro.
- `messages` é privada; o administrador pode apagar mensagens individuais ou todos os contatos depois de baixar uma cópia e confirmar com senha. Os limitadores por contato e sessão permanecem guardados para manter a proteção contra abuso. Não há limpeza automática por idade.
- `reservationLimits`, `reservationSessionLimits`, `messageLimits`, `messageSessionLimits` e `commentLimits` aplicam intervalos por contato ou sessão sem leitura pública; somente administradores podem listá-los ou apagá-los na redefinição completa.
- `customers`, `coupons`, `campaigns`, `messages` e `settings/vip` continuam protegidos pelas regras administrativas e de associação VIP. A confirmação do e-mail libera o VIP automaticamente para uma conta com ficha em `customers`; a primeira sessão confirmada registra a associação em `vipUsers`. No painel há uma única ação para remover ou reativar o VIP. A exclusão da ficha e da associação é atômica.
- Cupons devem estar publicados para funcionarem no carrinho. O código é convertido para maiúsculas e espaços digitados são removidos antes da busca; por exemplo, `TESTE 01` corresponde ao código cadastrado como `TESTE01`.
- O cliente recebe um aviso na tela após confirmar o e-mail e entrar novamente, e o link do grupo WhatsApp fica visível no painel da conta e na Comunidade. O envio de um segundo e-mail automático exigiria um provedor de e-mail transacional/backend que não está configurado na implantação estática gratuita.

`functions/` e os arquivos Mercado Pago são componentes antigos e não estão ativos no fluxo atual. O Cloudinary Worker protege os uploads e precisa da configuração Cloudflare antes de funcionar. O push é outro serviço externo e também precisa da configuração Cloudflare/OneSignal para avisos em segundo plano.

