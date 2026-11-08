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

Para habilitar o envio, crie no Cloudinary Console um upload preset chamado `graca_products_unsigned_v1` com **Unsigned**, formatos `jpg`, `png`, `webp`, pasta `graca/products` e IDs definidos pelo sistema. O preset unsigned é público; restrinja os formatos e a pasta, acompanhe o uso e desative/rotacione o preset se detectar abuso. A checagem de administrador na interface não substitui autenticação no serviço de upload.

Depois de criar o preset, abra **Produtos → Configurar upload** no painel para ver as opções, selecione arquivos ou cole URLs HTTPS e importe. URLs privadas, com login ou que bloqueiam buscas automatizadas podem ser recusadas pelo Cloudinary.

## WhatsApp e avisos

Reservas novas aparecem em tempo real quando o painel administrativo está aberto. Em **Visão Geral**, clique em **Ativar avisos neste dispositivo** para receber notificações do navegador enquanto o painel continuar aberto. A confirmação da reserva também oferece uma mensagem pronta para o WhatsApp administrativo `+55 63 99305-1964`; quem reservou ainda precisa tocar em **Enviar**.

Uma mensagem automática pelo WhatsApp, sem clique do cliente, não pode ser enviada só pelo site estático. A plataforma oficial exige uma conta de WhatsApp Business configurada, credenciais guardadas no servidor e os modelos/permissões aplicáveis; não usamos API não oficial.

## Publicação

1. Execute `npm run build`.
2. Publique as regras e o Hosting no projeto `graca-454ff`:

   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes,hosting --project graca-454ff
   ```

3. Adicione `localhost`, `127.0.0.1` e `amadeusfelipeserraandradeoliveira.github.io` em **Authentication → Settings → Authorized domains**, conforme os endereços usados.

## Dados principais

- `products` guarda catálogo e URLs do Cloudinary; `productCosts` mantém custo privado.
- `orders` guarda solicitações e histórico; pedidos não podem ser apagados pelo cliente nem pelo painel.
- `reservationLimits` e `messageLimits` aplicam os intervalos por contato sem expor leitura pública.
- `customers`, `vipUsers`, `coupons`, `campaigns`, `messages` e `settings/vip` continuam protegidos pelas regras administrativas e de associação VIP.

`functions/` e `cloudinary-worker/` contêm implementações de backend de versões anteriores. A configuração gratuita atual não as publica nem depende delas.

