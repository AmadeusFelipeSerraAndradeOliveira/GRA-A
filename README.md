# GRAÇA | Gente, Moda e Comunidade

Loja editorial de moda com catálogo no Firestore, carrinho, solicitação de reserva como visitante, cadastro opcional da Comunidade VIP e painel administrativo.

## Modelo desta versão

- A pessoa escolhe produtos, tamanhos e quantidades e envia uma **solicitação**, sem cartão, Pix ou cobrança.
- Só nome e WhatsApp são obrigatórios. Endereço é pedido apenas para entrega; retirada, observação e consentimento de novidades são opcionais.
- O código mostrado após o envio começa com `GRA-`. O status inicial é `Aguardando confirmação`; a equipe ainda precisa confirmar estoque e combinar o atendimento.
- Pedidos pendentes não alteram estoque. A confirmação administrativa relê produtos e estoque em uma transação Firestore. Pedidos confirmados podem ser cancelados, com devolução das unidades na mesma transação. Pedidos e clientes não têm ação de exclusão.
- Reservas de visitante usam Firebase Anonymous Authentication em segundo plano. Isso não mostra tela de cadastro nem pede senha; é necessário habilitar o provedor Anônimo no Firebase.
- O cadastro por e-mail é opcional. A área VIP exige conta com e-mail confirmado. Cupons e campanhas aparecem somente depois de publicados no painel. O consentimento de marketing é independente e não vem marcado.
- Cada produto novo ou alterado exige uma foto enviada ao Cloudinary. Um Cloudflare Worker confirma a conta administrativa e assina o envio; somente a `secure_url` e o ID público retornados são gravados no Firestore. O API Secret nunca entra no navegador. Remover a foto limpa a referência, mas não apaga o arquivo antigo no Cloudinary.
- A vitrine transforma a URL segura apenas na hora de exibir a imagem, usando `f_auto`, `q_auto` e limite de largura. A URL original retornada por `secure_url` continua sendo a referência salva no Firestore.
- As seis fotos de produto reconhecidas da pasta enviada foram carregadas na conta Cloudinary conectada. O botão de importação usa as `secure_url` existentes e cria produtos ocultos com preços de exemplo aleatórios e estoque entre 5 e 50; revise os rascunhos antes de publicar.
- Custos de aquisição são mantidos em `productCosts/{id}`, coleção acessível somente à equipe. Ao abrir o catálogo no painel, o administrador migra os custos antigos para essa coleção e remove esse campo dos documentos públicos dos produtos.
- Uma solicitação só pode ser encerrada como venda depois de marcada como entregue. O encerramento registra canal, pagamento, valor final e, para crédito parcelado, quantidade e valores exatos das parcelas. Análise Financeira mostra faturamento, ticket médio, vendas por canal/pagamento, produtos mais vendidos e um CSV.
- Contatos enviados pelo formulário são salvos na coleção privada `messages` para a equipe responder fora da loja. O site não envia mensagens automáticas por WhatsApp.

## Rodar e validar

```powershell
npm install
npm run dev
```

Abra `http://localhost:5501`. `npm run build` verifica a sintaxe JavaScript, sincroniza os arquivos usados pelo Firebase Hosting na pasta `public/` e confere os fluxos principais. O projeto é HTML/CSS/JavaScript estático, sem etapa de empacotamento.

As alterações de interface podem ser vistas sem login. Para reservar, precisa haver produtos ativos no Firestore e o provedor Anônimo habilitado. Não faça uma solicitação de teste no projeto de produção: ela cria um registro persistente. Use o Emulator Suite ou um projeto Firebase de teste para validar gravações.

## Firebase necessário

No projeto `graca-454ff`:

1. Em **Authentication → Sign-in method**, habilite **Anonymous** e **Email/Password**. Para clientes VIP e administradores, mantenha a confirmação de e-mail. Em **Settings → Authorized domains**, autorize os domínios de desenvolvimento e hospedagem, sem incluir portas: `localhost`, `127.0.0.1`, `graca-454ff.web.app` e `graca-454ff.firebaseapp.com`.
2. Cadastre a conta de administrador em **Authentication** e confirme o e-mail. Em Firestore, crie `admins/{UID}` usando o UID exato da conta, ou defina a custom claim `admin: true` pelo SDK Admin. As regras impedem que o próprio site crie ou remova permissões de administrador.
3. As regras revisadas foram compiladas e publicadas em `graca-454ff` em 07/11/2026. Para alterações futuras, revise e publique com `firebase deploy --only firestore:rules --project graca-454ff`.
4. Configure o Worker do Cloudinary e envie uma foto para cada produto. O editor valida a `secure_url` e o identificador Cloudinary, e as regras rejeitam imagens de outros domínios. Para publicar, revise nome, categoria, preço, estoque e variações antes de marcar **Publicado no catálogo**.
5. Nas coleções `products`, `categories`, `customers`, `orders`, `messages`, `admins`, `coupons`, `campaigns` e `settings`, as regras limitam leitura e escrita por função. Clientes podem ler somente seus próprios pedidos; visitantes não consultam pedidos por código público.

O gerador `@cloudinary/create-cloudinary-service-worker-lab` não foi adicionado como dependência do site: ele só copia arquivos para iniciar um service worker experimental. A loja já armazena imagens no Cloudinary, então as URLs de entrega otimizadas fazem esse trabalho sem interceptar todas as imagens do navegador.

O formulário de contato e as reservas salvam no Firestore diretamente com Firebase Auth. Regras verificam os campos, limites, UID, preço atual e total da reserva; cada sessão tem um intervalo mínimo de 30 segundos entre envios do mesmo tipo, imposto por uma gravação em lote e pelas regras. A equipe altera status apenas pelo painel; a confirmação de estoque usa uma transação Firestore para impedir baixa duplicada ou estoque negativo. A integração de pagamentos em Functions, se reativada, lê nome, preço, desconto e disponibilidade na mesma transação que grava a reserva.

**Limite de custo e abuso:** esta implementação não depende de Cloud Functions, Blaze, Firebase Storage nem gateway. Firebase Spark ainda tem limites de leitura, gravação e tráfego. O intervalo de 30 segundos reduz envios repetidos pela mesma sessão, mas uma pessoa pode criar outra sessão anônima; App Check e detecção de spam ainda precisam ser configurados no Console Firebase antes de uma campanha pública.

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

### Orientação para cadastrar fotos e produtos

1. No painel administrativo, abra **Produtos → Configurar upload** e informe a URL `workers.dev` que termina em `/upload`. Essa URL identifica o Worker; ela não é a chave do Cloudinary.
2. Para um produto individual, escolha a foto no editor, clique em **Enviar foto**, confira a prévia e salve. Só então o Firestore recebe a URL segura e o identificador devolvidos pelo Cloudinary.
3. Para os exemplos enviados, clique em **Importar 6 rascunhos com fotos do Cloudinary**. As seis URLs seguras e os IDs públicos ficam no manifesto `catalog-seed.js`; artes de campanha e logotipos não entram no estoque.
4. A importação cria rascunhos invisíveis ao público e inventa preço/estoque de demonstração. Abra cada rascunho, confirme os dados reais, tamanhos e variações, mantenha a foto correta e só depois marque **Publicado no catálogo**.
5. Para trocar uma foto, envie a imagem nova e salve. O produto passa a apontar para a nova `secure_url`; o arquivo anterior permanece na conta Cloudinary até ser removido pelo proprietário no painel Cloudinary.

## Dados anteriores e integrações pausadas

Produtos que já estavam no Firestore continuam lá e não são apagados. A edição de um produto antigo sem foto Cloudinary exige enviar uma foto antes de salvar. O catálogo salvo neste navegador só pode ser migrado quando seus produtos já têm uma URL Cloudinary válida; a migração os cria como rascunhos. Os pedidos antigos ficam visíveis e os registros não podem ser excluídos pelo painel.

O código das rotas Mercado Pago permanece em `functions/`, mas não foi possível validar nesta rodada que os endpoints estão publicados ou que as credenciais secretas estão configuradas. Pagamentos não foram testados de ponta a ponta; confirme o estado das funções, segredos e webhook no Firebase antes de aceitar pagamentos.

## Arquivos principais

- `index.html`, `style.css`: identidade da marca, vitrine e experiência mobile.
- `app.js`: catálogo, carrinho, reserva, cadastro VIP, painel, importação de exemplos, encerramento de venda, relatórios e sincronização em tempo real.
- `catalog-seed.js`: nomes e fotos de peças reconhecidas na pasta fornecida; o manifesto não inclui material editorial.
- `firestore.rules`: validação de catálogo, URLs Cloudinary, reservas, estoque, encerramento com dados financeiros, mensagens e conteúdo VIP; acesso negado por padrão.
- `cloudinary-worker/src/index.js`: autenticação Firebase e upload assinado no Cloudinary.
- `cloudinary-worker/wrangler.toml`: projeto Firebase e origens locais/publicadas permitidas no CORS.
- `scripts/check-build.cjs`: checagens de sintaxe, fluxos de segurança e ausência do checkout antigo.

## Validação disponível

`npm run build` é uma verificação estática, não um teste de integração. A validação das regras pelo Firebase Emulator Suite ainda precisa ser feita em uma máquina com Java instalado. Não foram criados pedidos, clientes, produtos ou uploads na base de produção durante a revisão local.

