# Revisão das regras do Firestore

## Controles locais preparados

- Administração exige sessão autenticada com e-mail verificado e `admin: true` em custom claim ou em `admins/{uid}`. O site não concede nem remove permissões administrativas.
- Leitura pública do catálogo é limitada a produtos e categorias ativos. A escrita de produtos, categorias, custos, cupons, campanhas, configurações, status de pedidos, VIP e mensagens é restrita à equipe autorizada.
- Custos de aquisição ficam em `productCosts/{productId}`; não fazem parte do documento público de produto. A regra mantém uma migração estreita para documentos antigos que ainda tenham `cost`.
- Reservas e mensagens novas não podem ser criadas diretamente pelo navegador. As Functions autenticam o token Firebase, derivam o IP no servidor e aplicam limites transacionais independentes por UID e por origem IP (rede `/64` para IPv6). O início de pagamento usa o mesmo limite; consultas de status têm janela de cinco segundos. O hash de IP usa `PUBLIC_FORM_RATE_LIMIT_KEY`; os documentos de IP expiram por TTL depois de 30 dias.
- A API de reserva valida o catálogo, o preço, a disponibilidade e o cupom VIP publicado em uma transação. O limite de usos do cupom é reservado atomicamente e liquidado quando o pedido é concluído ou cancelado. A chave de repetição do pedido evita duplicar uma mesma solicitação.
- Os pedidos não podem ser apagados. Os clientes não podem ser apagados. Produtos podem ser removidos pelo administrador, mantendo os snapshots existentes nos pedidos.
- Cupons e campanhas podem ser excluídos pelo administrador e os clientes VIP ativos leem somente os itens publicados. `vipUsers/{uid}` não pode ser criado pelo próprio cliente; só administrador concede a associação.
- O link do grupo é restrito ao administrador e membros VIP ativos. A ativação VIP pode gerar uma mensagem na coleção `mail` para a extensão Firebase Trigger Email.
- O encerramento financeiro valida canal, método de pagamento, valor, quantidade de parcelas e soma das parcelas.

## Implantação e teste

As regras neste arquivo são a versão local revisada. O site precisa que as Functions públicas estejam implantadas antes de publicar as regras que negam criação direta de `orders` e `messages`; do contrário, reserva e contato ficam indisponíveis. Cadastre `PUBLIC_FORM_RATE_LIMIT_KEY` no Secret Manager antes de implantar as Functions. Cloud Functions/Secret Manager requerem plano Blaze.

`npm run build` verifica a sintaxe dos arquivos e os caminhos principais. A compilação das regras e os testes positivos/negativos com Emulator Suite precisam ser executados antes de considerar a autorização plenamente validada. Uma execução do formulário de reserva na produção cria um registro persistente e não deve ser usada como teste descartável.

O limite por IP enfrenta a criação de novos UIDs anônimos na mesma origem; VPNs, proxies e a troca de rede ainda podem contorná-lo. App Check pode complementar esta barreira depois de registrar o provedor e ativar a aplicação das verificações.
