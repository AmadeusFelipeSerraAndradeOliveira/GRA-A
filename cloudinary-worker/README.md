# Upload protegido de imagens GRAÇA

Este Cloudflare Worker assina cada envio para o Cloudinary no servidor. A loja envia o token Firebase do administrador e a imagem; o Worker valida a assinatura do token, o e-mail confirmado, a autorização em `admins/{uid}` ou a custom claim `admin: true`, o tipo e o limite de 5 MB. O segredo do Cloudinary nunca é colocado no site.

## Configuração na conta do proprietário

1. Crie ou use uma conta Cloudinary e anote o Cloud name, API Key e API Secret. Não envie esses valores por chat nem os salve no repositório.
2. Instale e autentique o Wrangler na sua máquina com sua conta Cloudflare: `npx wrangler@latest login`.
3. Configure os três valores como segredos do Worker, sem colocá-los no `wrangler.toml`:

   ```powershell
   npx wrangler@latest secret put CLOUDINARY_CLOUD_NAME --config cloudinary-worker/wrangler.toml
   npx wrangler@latest secret put CLOUDINARY_API_KEY --config cloudinary-worker/wrangler.toml
   npx wrangler@latest secret put CLOUDINARY_API_SECRET --config cloudinary-worker/wrangler.toml
   ```

4. Publique: `npx wrangler@latest deploy --config cloudinary-worker/wrangler.toml`.
5. Copie a URL `workers.dev` retornada, abra o painel administrativo da loja → Produtos → Configurar upload e salve a URL terminada em `/upload`.
6. Faça um envio de teste com uma imagem sem dados pessoais. Confira a URL no Cloudinary e no documento `products/{id}` no Firestore.

O Worker permite somente os domínios enumerados em `ALLOWED_ORIGINS`. Ao usar outro domínio publicado ou endereço local, atualize essa lista antes de publicar o Worker. O projeto Firebase deve permitir o login anônimo para reservas; para o upload, o administrador precisa usar e-mail/senha e confirmar o e-mail.

Remover a foto no editor remove a referência do produto; não apaga o ativo do Cloudinary. A exclusão do arquivo remoto não faz parte deste endpoint.

