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

Os formulários enviam dados diretamente ao Firestore em uma operação atômica. As regras validam os campos, os produtos, o preço vigente, o status inicial e um intervalo de 30 segundos por número de WhatsApp na reserva e por e-mail no contato. Um limite adicional no navegador dificulta envios repetidos no mesmo dispositivo; formulários também têm um campo anti-robô oculto.

Como o plano Spark não executa código servidor, não há bloqueio confiável por endereço de rede. Uma pessoa que trocar o número informado ou contornar a autenticação ainda pode tentar novos envios. Para restringir abuso por IP de forma forte é preciso um servidor confiável; isso pode ser hospedado fora do Firebase, por exemplo em uma plataforma com plano gratuito, mas não faz parte desta configuração.

## Fotos no Cloudinary

O painel envia arquivos JPEG, PNG e WebP de até 5 MB, ou busca um link de imagem HTTPS, diretamente à API de upload do Cloudinary. O produto grava `secure_url` e `public_id` devolvidos pelo serviço. Não há segredo de API no código do site.

Para habilitar o envio, crie no Cloudinary Console um upload preset chamado `graca_products_unsigned_v1` com **Unsigned / Não assinado**, formatos `jpg`, `png`, `webp`, pasta de ativos `graca/products`, sem sobrescrita e com ID público gerado automaticamente. A pasta de ativos organiza a Biblioteca de Mídia e não precisa aparecer no `public_id`; o site valida o Cloud Name e salva o ID retornado pelo Cloudinary. O preset unsigned é público; restrinja formatos e pasta, impeça IDs definidos pelo cliente, acompanhe o uso e desative/rotacione o preset se detectar abuso. A checagem de administrador na interface não substitui autenticação no serviço de upload.

Depois de criar o preset, abra **Produtos → Configurar upload** no painel para ver as opções, selecione arquivos ou cole URLs HTTPS e importe. URLs privadas, com login ou que bloqueiam buscas automatizadas podem ser recusadas pelo Cloudinary.

## WhatsApp e avisos de novas reservas

As reservas novas aparecem em tempo real quando o painel administrativo está aberto. Também foi preparada uma inscrição de push com OneSignal: depois de conectar as contas gratuitas e publicar o Worker descrito abaixo, clique em **Visão Geral → Ativar avisos em segundo plano** em cada aparelho administrativo. O serviço usa um Worker gratuito fora do Firebase para enviar o push e o OneSignal para entregá-lo ao navegador; o segredo da API fica no Cloudflare, nunca no site.

### Ativar notificações fora do navegador

1. Crie uma aplicação gratuita no OneSignal para o site `https://graca-454ff.web.app`, habilite **Web Push** e copie o **App ID** em **Settings → Keys & IDs**.
2. Crie uma conta Cloudflare e abra um terminal na pasta `cloudflare-push`:

   ```powershell
   npm install
   npx wrangler login
   npx wrangler kv namespace create PUSH_STATE
   ```

3. Copie o `id` retornado para `cloudflare-push/wrangler.toml`, substituindo `CRIE_E_COLE_O_ID_DO_NAMESPACE_KV`. Atualize o App ID nessa configuração e também em `push-config.js`.
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

- `products` guarda catálogo, quantidades por tamanho e URLs do Cloudinary; `productCosts` mantém custo privado. Produtos antigos sem divisão por tamanho carregam o estoque total na primeira variação até a equipe informar os números reais.
- `orders` guarda solicitações e histórico. A redefinição completa do site pode apagá-los somente após gerar uma cópia JSON, confirmar a senha administrativa e digitar `REDEFINIR SITE`; os cadastros de clientes, contas Firebase e administradores são preservados. Esse fluxo não apaga as fotos armazenadas no Cloudinary.
- `customers` mantém fichas de cliente; ao excluir uma ficha pelo painel, a associação em `vipUsers` também é removida no mesmo lote. A ação **Redefinir perfis e VIPs** baixa uma cópia, exige senha e confirmação digitada, apaga as fichas e vínculos VIP, e mantém os logins do Firebase Authentication, pedidos e financeiro.
- `messages` é privada; o administrador pode apagar mensagens individuais ou todos os contatos depois de baixar uma cópia e confirmar com senha. Os limitadores `messageLimits` permanecem guardados para manter a proteção contra abuso. Não há limpeza automática por idade.
- `reservationLimits` e `messageLimits` aplicam os intervalos por contato sem leitura pública; somente administradores podem listá-los ou apagá-los na redefinição completa.
- `customers`, `coupons`, `campaigns`, `messages` e `settings/vip` continuam protegidos pelas regras administrativas e de associação VIP. A confirmação do e-mail libera o VIP automaticamente para uma conta com ficha em `customers`; a primeira sessão confirmada registra a associação em `vipUsers`. No painel há uma única ação para remover ou reativar o VIP. A exclusão da ficha e da associação é atômica.
- Cupons devem estar publicados para funcionarem no carrinho. O código é convertido para maiúsculas e espaços digitados são removidos antes da busca; por exemplo, `TESTE 01` corresponde ao código cadastrado como `TESTE01`.
- O cliente recebe um aviso na tela após confirmar o e-mail e entrar novamente, e o link do grupo WhatsApp fica visível no painel da conta e na Comunidade. O envio de um segundo e-mail automático exigiria um provedor de e-mail transacional/backend que não está configurado na implantação estática gratuita.

`functions/` e `cloudinary-worker/` contêm implementações de backend de versões anteriores. A configuração gratuita do site não depende delas. O push é o único backend externo descrito acima e precisa da configuração Cloudflare/OneSignal antes de receber avisos em segundo plano.

