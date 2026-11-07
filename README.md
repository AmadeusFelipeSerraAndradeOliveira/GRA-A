# GRAÇA | Gente, Moda e Comunidade

Loja editorial de moda com catálogo no Firestore, carrinho, solicitação de reserva como visitante, cadastro opcional da Comunidade VIP e painel administrativo.

## Modelo desta versão

- A pessoa escolhe produtos, tamanhos e quantidades e envia uma **solicitação**, sem cartão, Pix ou cobrança.
- Só nome e WhatsApp são obrigatórios. Endereço é pedido apenas para entrega; retirada, observação e consentimento de novidades são opcionais.
- O código mostrado após o envio começa com `GRA-`. O status inicial é `Aguardando confirmação`; a equipe ainda precisa confirmar estoque e combinar o atendimento.
- Pedidos pendentes não alteram estoque. A confirmação administrativa relê produtos e estoque em uma transação Firestore. Pedidos confirmados podem ser cancelados, com devolução das unidades na mesma transação. Pedidos e clientes não têm ação de exclusão.
- Reservas de visitante usam Firebase Anonymous Authentication em segundo plano. Isso não mostra tela de cadastro nem pede senha; é necessário habilitar o provedor Anônimo no Firebase.
- O cadastro por e-mail é opcional. A área VIP exige conta com e-mail confirmado. Cupons e campanhas aparecem somente depois de publicados no painel. O consentimento de marketing é independente e não vem marcado.
- Fotos são enviadas a um Cloudflare Worker, que confirma a conta administrativa e assina o envio para o Cloudinary. O API Secret nunca entra no navegador. Remover a foto do produto limpa a referência; o arquivo antigo no Cloudinary não é apagado.
- Contatos enviados pelo formulário são salvos na coleção privada `messages` para a equipe responder fora da loja. O site não envia mensagens automáticas por WhatsApp.

## Rodar e validar

```powershell
npm install
npm run dev
```

Abra `http://localhost:5501`. O comando `npm run build` verifica a sintaxe JavaScript e confere se a vitrine deixou de carregar o SDK de pagamento antigo. O projeto é HTML/CSS/JavaScript estático, sem etapa de empacotamento.

As alterações de interface podem ser vistas sem login. Para reservar, precisa haver produtos ativos no Firestore e o provedor Anônimo habilitado. Não faça uma solicitação de teste no projeto de produção: ela cria um registro persistente. Use o Emulator Suite ou um projeto Firebase de teste para validar gravações.

## Firebase necessário

No projeto `graca-454ff`:

1. Em **Authentication → Sign-in method**, habilite **Anonymous** e **Email/Password**. Para clientes VIP e administradores, mantenha a confirmação de e-mail. Em **Settings → Authorized domains**, autorize os domínios de desenvolvimento e hospedagem, sem incluir portas: `localhost`, `127.0.0.1`, `graca-454ff.web.app` e `graca-454ff.firebaseapp.com`.
2. Cadastre a conta de administrador em **Authentication** e confirme o e-mail. Em Firestore, crie `admins/{UID}` usando o UID exato da conta, ou defina a custom claim `admin: true` pelo SDK Admin. As regras impedem que o próprio site crie ou remova permissões de administrador.
3. Revise e publique as regras: `firebase deploy --only firestore:rules --project graca-454ff`.
4. Cadastre produtos pela área administrativa ou importe explicitamente o catálogo que já esteja salvo neste navegador. O catálogo não é preenchido com produtos demonstrativos automaticamente. Para publicar, preencha nome, categoria, preço, estoque, variações e marque **Publicado no catálogo**.
5. Nas coleções `products`, `categories`, `customers`, `orders`, `messages`, `admins`, `coupons`, `campaigns` e `settings`, as regras limitam leitura e escrita por função. Clientes podem ler somente seus próprios pedidos; visitantes não consultam pedidos por código público.

O formulário de contato e as reservas salvam no Firestore diretamente com Firebase Auth. Regras verificam os campos, limites, UID, preço atual e total da reserva. A equipe altera status apenas pelo painel; a confirmação de estoque usa uma transação Firestore para impedir baixa duplicada ou estoque negativo.

**Limite de custo e abuso:** esta implementação não depende de Cloud Functions, Blaze, Firebase Storage nem gateway. Firebase Spark ainda tem limites de leitura, gravação e tráfego; Auth anônimo também pode ser abusado para gerar solicitações. App Check, limitação de taxa e detecção de spam não estão configurados neste branch. Verifique cotas e proteção contra abuso antes de uma campanha pública.

### Cotas públicas consultadas em 06/11/2026

- O Cloud Firestore informa cota gratuita diária de 50 mil leituras, 20 mil gravações e 20 mil exclusões, mais 1 GiB armazenado e 10 GiB/mês de transferência de saída para a base elegível. Listeners em tempo real também consomem leituras quando documentos entram ou mudam no resultado ([cotas e cobrança](https://firebase.google.com/docs/firestore/pricing)).
- O plano Free do Cloudflare Workers permite até 100 mil requisições por dia e 50 sub-requisições por chamada. O Worker de upload foi mantido pequeno e usa poucas chamadas externas ([limites do Workers](https://developers.cloudflare.com/workers/platform/limits/)).
- A página atual do Cloudinary lista 25 créditos mensais no plano Free; armazenamento, transformações e tráfego de imagens consomem esses créditos. A disponibilidade e os limites devem ser monitorados no painel da conta ([planos do Cloudinary](https://cloudinary.com/pricing), [medição de uso](https://cloudinary.com/documentation/billing_and_plans)).

Esses limites permitem começar sem ativar Blaze nem contratar um serviço, mas não significam uso ilimitado nem custo zero garantido em qualquer volume. Confirme os limites antes de ampliar o tráfego e monitore o uso nas contas dos fornecedores.

## Configurar upload Cloudinary

O worker está em `cloudinary-worker/`. A implantação depende da conta Cloudflare e das credenciais Cloudinary do proprietário; não há credenciais ou URL inventadas no repositório.

1. Crie/acesse sua conta Cloudinary e guarde o Cloud name, API Key e API Secret.
2. Instale o Wrangler pela distribuição oficial e autentique sua conta Cloudflare: `npx wrangler@latest login`.
3. Grave os três segredos usando os comandos em [cloudinary-worker/README.md](cloudinary-worker/README.md). Não cole os valores no chat, no HTML ou no `wrangler.toml`.
4. Publique com `npx wrangler@latest deploy --config cloudinary-worker/wrangler.toml`.
5. No painel da loja, abra **Produtos → Configurar upload** e cole o endereço `https://…workers.dev/upload` retornado pelo Wrangler. O endpoint público não é uma chave secreta.
6. Faça um envio de teste controlado. O Worker aceita JPEG, PNG e WebP até 5 MB e somente para uma conta administrativa verificada.

O Worker limita requisições aos domínios em `ALLOWED_ORIGINS`. Atualize a lista antes de publicar em um domínio diferente. A conta Cloudinary precisa permitir os uploads assinados da aplicação; os limites do plano gratuito podem mudar.

## Dados anteriores e integrações pausadas

Produtos que já estavam no Firestore continuam lá e não são apagados. O painel também deixa registros antigos de pedidos visíveis; pedidos com formato/status da integração anterior não podem ser confirmados por este novo fluxo. O catálogo salvo no navegador só é enviado se um administrador escolher a importação e confirmar a lista.

O checkout Mercado Pago, o SDK de cartão/Pix, as rotas de pagamento e Cloud Functions ficam fora do fluxo desta etapa. Não publicar nem executar `firebase deploy --only functions`. A aplicação antiga e os arquivos de integração foram removidos do branch proposto, preservando os registros existentes no Firestore.

## Arquivos principais

- `index.html`, `style.css`: identidade da marca, vitrine e experiência mobile.
- `app.js`: catálogo, carrinho, reserva, cadastro VIP, painel e sincronização em tempo real.
- `firestore.rules`: validação de catálogo, reservas, estoque, mensagens e conteúdo VIP; acesso negado por padrão.
- `cloudinary-worker/src/index.js`: autenticação Firebase e upload assinado no Cloudinary.
- `cloudinary-worker/wrangler.toml`: projeto Firebase e origens locais/publicadas permitidas no CORS.
- `scripts/check-build.cjs`: checagens de sintaxe e ausência do checkout antigo.

## Validação disponível

`npm run build` é uma verificação estática, não um teste de integração. A validação das regras pelo Firebase Emulator Suite ainda precisa ser feita em uma máquina com Java instalado. Não foram criados pedidos, clientes, produtos ou uploads na base de produção durante a revisão local.

