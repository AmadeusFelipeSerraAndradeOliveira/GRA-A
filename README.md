# GRAÇA | Gente, Moda e Comunidade

Loja editorial de moda com catálogo Cloudinary/Firestore, solicitação de reserva, área VIP e painel administrativo.

## O que o site faz

- O cliente monta o carrinho, informa nome/WhatsApp e envia uma **solicitação**. A equipe confere estoque e confirma pelo painel; enviar a solicitação não cobra pagamento nem baixa estoque.
- Pedidos e cadastros de clientes são preservados. Um pedido pode ser cancelado ou ter o status alterado, mas não apagado. O painel permite remover um produto do catálogo, mantendo o histórico registrado nos pedidos.
- Os formulários de reserva e contato usam Firebase Authentication em segundo plano e enviam ao endpoint de Functions. O servidor limita cada origem IP e cada UID a um envio por 30 segundos; no IPv6, endereços da mesma rede `/64` compartilham o limite. Os identificadores IP são protegidos por HMAC antes de serem salvos. O início de pagamento também aplica o limite por UID e IP, e a consulta de status tem janela independente de cinco segundos.
- O site valida cupons publicados no carrinho e a função de reserva recalcula preços, estoque e desconto no Firestore antes de gravar. Cupons e campanhas do painel usam listeners em tempo real.
- Produtos aceitam uma galeria de até cinco imagens. Arquivos JPEG, PNG e WebP de até 5 MB e links públicos HTTPS passam pelo Cloudinary Worker; somente `secure_url` e `public_id` retornados pelo Cloudinary são gravados no produto.
- A área financeira é separada da Visão Geral. Ela mostra vendas encerradas, ticket médio, canais, formas de pagamento, desempenho dos produtos e exportação CSV. Encerrar uma venda registra canal, forma de pagamento e parcelas quando aplicável.
- A conta confirmada por e-mail não recebe acesso VIP automaticamente. Um administrador vincula/ativa um membro; o link privado do grupo é acessível somente a membros ativos e à equipe. A ativação prepara um e-mail na coleção `mail` para a extensão Firebase Trigger Email.
- O painel oferece pesquisa e desativação de produtos, gestão de status VIP, botão de WhatsApp nas mensagens e sincronização das coleções por listeners do Firestore.

## Fotos de exemplo e identidade da marca

As fotos de produto, o logotipo, o slogan “Gente, Moda e Comunidade” e as artes institucionais da pasta fornecida foram carregados no Cloudinary conectado. `catalog-seed.js` contém **oito produtos de exemplo** com galerias quando há mais de uma foto.

No painel, abra **Produtos → Importar 8 rascunhos com fotos**. A rotina cria rascunhos ocultos com preços de demonstração aleatórios dentro de faixas de varejo e estoque de 5 a 50 unidades. Antes de publicar qualquer peça, revise nome, preço, tamanhos, estoque e imagem. A importação não publica produtos na vitrine automaticamente.

Para uma peça nova, abra **Produtos → Novo Produto**, selecione até cinco arquivos ou adicione URLs HTTPS e use os botões de envio/importação. Confira a galeria e salve. Para remover uma foto da galeria, use **Remover** no editor; isso apaga a referência no produto, mas não destrói o arquivo na conta Cloudinary.

## Executar e verificar localmente

```powershell
npm install
npm run dev
```

Abra `http://localhost:5501`. O servidor local encaminha `/api/...` ao Firebase Hosting para evitar CORS. `npm run build` verifica sintaxe e fluxos principais e sincroniza os arquivos para `public/`, que é a pasta publicada pelo Firebase Hosting.

As operações de gravação dependem de Functions já publicadas e da chave `PUBLIC_FORM_RATE_LIMIT_KEY` no Secret Manager do Firebase. A autenticação Anônima e por e-mail/senha deve estar habilitada no Firebase Authentication. Domínios de desenvolvimento e hospedagem devem estar em **Authentication → Settings → Authorized domains**. Se usar o GitHub Pages, adicione `amadeusfelipeserraandradeoliveira.github.io`; os formulários apontam para o Firebase Hosting e a origem está incluída nas listas CORS do Functions e do Worker.

## Publicação das Functions e regras

O projeto Firebase `graca-454ff` precisa estar no plano Blaze para implantar Cloud Functions e usar Secret Manager. Não coloque segredos no repositório, no navegador nem nesta documentação.

1. Gere uma chave aleatória local de pelo menos 32 bytes e cadastre-a de forma interativa como `PUBLIC_FORM_RATE_LIMIT_KEY` no Firebase Secret Manager. Essa chave assina o hash do IP; o valor nunca é devolvido ao navegador.
2. Implante primeiro as Functions, incluindo `publicReservation`, `publicMessage`, `settleReservationCoupon` e `queueVipWelcomeEmail`. O início e a consulta dos pagamentos também usam a chave de limite; as rotas Mercado Pago só devem ser implantadas quando `MP_CLIENT_ID`, `MP_CLIENT_SECRET` e `MP_WEBHOOK_SECRET` estiverem configurados.
3. Só depois de confirmar que os dois endpoints públicos respondem, publique `firestore.rules` e o índice TTL de `submissionRateLimits.expireAt`. As regras atuais negam criação de reserva e mensagem diretamente pelo navegador para impedir que o limite por IP seja contornado.
4. Execute `npm run build` e publique Hosting. O conteúdo hospedado vem de `public/`.

Se a conta ainda estiver no plano Spark, não publique as regras novas antes das Functions: os formulários do site atual dependem dessas rotas. Nesse caso, mantenha o site anterior até habilitar faturamento e terminar a implantação encadeada.

O limite por IP dificulta o bypass com uma nova sessão anônima; ele não impede completamente abuso com VPN, proxy ou troca de rede. App Check com uma chave de site reCAPTCHA válida é uma camada adicional recomendada quando estiver configurada no Console.

## E-mail de boas-vindas VIP

Quando a equipe muda o status de uma pessoa para **Ativo** e já configurou o link do grupo em **Clientes / VIP → Configurar link do grupo**, a Function adiciona uma mensagem formatada à coleção `mail`. Para o envio real, instale e configure a extensão oficial **Trigger Email from Firestore** com um SMTP e remetente verificado. O código não contém senha de e-mail; sem a extensão e o SMTP configurados, o registro fica apenas na fila e não chega à caixa do cliente. Cabeçalhos sozinhos não garantem entrega nem evitam spam; SPF, DKIM e DMARC dependem do domínio e do provedor de e-mail.

## Upload Cloudinary

O Worker está em `cloudinary-worker/`. Para habilitá-lo, use sua conta Cloudflare e os valores do Cloudinary:

1. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` como segredos do Worker, sem adicioná-los ao Git.
2. Publique `cloudinary-worker/wrangler.toml` com Wrangler na sua conta Cloudflare.
3. No painel administrativo, selecione **Produtos → Configurar upload** e informe o endereço HTTPS `workers.dev/upload` publicado pelo Wrangler.
4. Faça um envio com uma conta administradora e confirme a prévia na galeria.

O Worker verifica o token do Firebase, a autorização administrativa, a origem permitida e o formato dos arquivos. Para URLs, exige endereço público HTTPS sem credenciais, porta especial ou host local; o Cloudinary re-hospeda a imagem e retorna a referência final. O serviço externo pode recusar uma URL ou um formato que não consiga importar.

## Dados e limites conhecidos

- `products` e `productCosts` ficam separados para manter custo de aquisição privado. Só administradores verificados escrevem produtos e custos.
- `vipUsers/{uid}` registra o status da associação VIP; bloquear/remover altera o vínculo sem apagar a conta do cliente.
- Pedidos e clientes não têm permissão de exclusão nas regras. A exclusão de produto é administrativa, e não remove pedidos históricos.
- Relatórios financeiros usam as vendas encerradas carregadas no painel, até o limite de 250 pedidos recentes. A margem estimada usa o custo atual do produto, não histórico de custo por venda.
- O envio do e-mail VIP depende da instalação e credenciais da extensão de e-mail. A integração Mercado Pago continua independente; credenciais, webhook e testes de pagamento precisam ser conferidos antes de cobrar clientes.

## Arquivos principais

- `index.html`, `style.css`: loja, identidade e layout administrativo.
- `app.js`: carrinho, cupons, reservas, galeria, VIP, painel, relatórios e atualização em tempo real.
- `catalog-seed.js`: oito itens de demonstração com fotos Cloudinary.
- `firestore.rules`, `firestore.indexes.json`: autorização e expiração dos hashes de IP.
- `functions/index.js`: Mercado Pago, endpoints rate-limited e fila de boas-vindas VIP.
- `cloudinary-worker/src/index.js`: validação administrativa e upload/re-hospedagem protegidos.
- `scripts/check-build.cjs`: verificação estática e sincronização da pasta Hosting.

## Validação

`npm run build` é uma checagem local de sintaxe e conteúdo, não um teste de integração. Os testes do Firebase Emulator Suite e os testes reais de e-mail, upload, webhook e reserva devem ser executados com as respectivas contas/segredos configurados. Não use um pedido de teste no banco de produção sem confirmar que ele pode ficar registrado permanentemente.
