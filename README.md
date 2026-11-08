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
- `orders` guarda solicitações e histórico; pedidos não são apagados. A área financeira permite resumir e exportar CSV antes de qualquer decisão de retenção.
- `customers` mantém fichas de cliente; ao excluir uma ficha pelo painel, a associação em `vipUsers` também é removida no mesmo lote. A conta Firebase, os pedidos e o histórico financeiro permanecem.
- `messages` é privada; o administrador pode excluir mensagens individuais. Não há limpeza automática por idade.
- `reservationLimits` e `messageLimits` aplicam os intervalos por contato sem expor leitura pública.
- `customers`, `coupons`, `campaigns`, `messages` e `settings/vip` continuam protegidos pelas regras administrativas e de associação VIP. A confirmação do e-mail libera o VIP automaticamente para uma conta com ficha em `customers`; a primeira sessão confirmada registra a associação em `vipUsers`. No painel há uma única ação para remover ou reativar o VIP. A exclusão da ficha e da associação é atômica.
- Cupons devem estar publicados para funcionarem no carrinho. O código é convertido para maiúsculas e espaços digitados são removidos antes da busca; por exemplo, `TESTE 01` corresponde ao código cadastrado como `TESTE01`.
- O cliente recebe um aviso na tela após confirmar o e-mail e entrar novamente, e o link do grupo WhatsApp fica visível no painel da conta e na Comunidade. O envio de um segundo e-mail automático exigiria um provedor de e-mail transacional/backend que não está configurado na implantação estática gratuita.

`functions/` e `cloudinary-worker/` contêm implementações de backend de versões anteriores. A configuração gratuita atual não as publica nem depende delas.

