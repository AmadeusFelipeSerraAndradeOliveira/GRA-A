# Revisão das regras do Firestore

## Controles atuais

- Administração requer uma conta autenticada com e-mail verificado e `admin: true` em custom claims ou documento `admins/{uid}` gerenciado pelo proprietário. O cliente não pode editar essa coleção.
- Produtos e categorias podem ser lidos publicamente somente quando `active == true`; só administradores podem criar ou editar. Produtos exigem URL segura Cloudinary e ID em `graca/products/`. Custos ficam em `productCosts/{id}`, coleção acessível apenas a administradores.
- A reserva exige autenticação, vínculo com o UID da sessão, até seis combinações, preço conferido com o catálogo, total recalculado e atualização atômica de um limite de 30 segundos por UID. Um pedido pendente não desconta estoque. Só administradores podem avançar estados válidos; exclusão de pedido é negada.
- Mensagens podem ser enviadas por sessões autenticadas, com limites de tamanho e lote atômico com limite de 30 segundos por UID. A leitura e atualização ficam restritas a administradores; exclusão é negada.
- Cupons e campanhas em rascunho ficam restritos a administradores. Conteúdo publicado requer conta de membro verificada. Clientes, pedidos, produtos, cupons, campanhas e mensagens não podem ser excluídos pelo cliente.
- O encerramento financeiro valida canal, forma de pagamento e parcelas que fecham o valor final registrado.

## Validação e limites

- O Firebase CLI compilou e publicou estas regras no projeto `graca-454ff` em 07/11/2026.
- `npm run build` valida a sintaxe e as verificações estáticas dos fluxos; não substitui testes de autorização no Firestore Emulator.
- Os testes positivos/negativos do Emulator não foram executados porque Java não está disponível nesta máquina. Não foi criada reserva de teste na base de produção.
- O limite de envio é por UID. Sessões anônimas adicionais podem contorná-lo; App Check/reCAPTCHA e o enforcement ainda precisam de configuração no Console Firebase.
- Administradores devem confirmar o e-mail antes de acessar dados administrativos. Se categorias e mensagens falharem no painel, confira o estado de verificação da conta e o documento `admins/{uid}`/claim. A coleção `categories` deve estar consultada com `active == true` para usuários públicos.
- A migração de produtos antigos que ainda tenham `cost` incorporado ocorre quando uma conta administrativa abre a aba Produtos. Verifique se a migração terminou antes de considerar todos os custos ocultos dos documentos públicos.
- Os relatórios financeiros usam no máximo 250 pedidos carregados e a margem usa o custo atual do produto, sem histórico de custo por venda.
