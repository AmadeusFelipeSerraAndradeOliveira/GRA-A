# Revisão das regras Firestore

As regras deste projeto são destinadas ao Firebase Standard/Native `graca-454ff` e ao uso de Authentication, Firestore e Hosting no plano Spark.

## Controles incluídos

- Acesso administrativo exige e-mail verificado e uma custom claim `admin` ou documento `admins/{uid}`; usuários não podem conceder esse papel a si próprios.
- Catálogo publicado é legível pela loja. Criação e edição continuam restritas ao painel autorizado; custos ficam em `productCosts`.
- Reserva é criada como pedido pendente, com itens, preço e quantidade comparados ao catálogo atual. A criação precisa vir no mesmo lote de gravação que o limite por número de WhatsApp.
- Mensagem de contato precisa vir no mesmo lote que o limite por e-mail. Esses dois limitadores não têm leitura nem listagem pública; uma sessão anônima diferente ainda encontra o tempo de espera quando reutiliza o mesmo contato.
- Alterações administrativas de pedido preservam identidade, itens, total, endereço e histórico anterior. A baixa/restauração de estoque ocorre separadamente e só com conta administrativa.
- Pedidos e cadastros de clientes não podem ser excluídos. VIP, cupons, campanhas, custos e mensagens privadas permanecem limitados à função administrativa ou ao respectivo membro VIP.

## Limite de abusos sem servidor

O intervalo no Firestore é por telefone de reserva e e-mail do contato, além do limite local no navegador e do campo anti-robô. Esse desenho dificulta a troca de sessão anônima, mas não bloqueia alguém que invente números/e-mails diferentes ou contorne o cliente. O plano Spark não oferece uma função server-side para aplicar limite confiável por endereço IP. Não apresentar esse mecanismo como defesa completa contra bots.

## Verificação pendente

As regras devem ser validadas no Firebase Emulator ou pelo validador de implantação antes de tráfego amplo. O Emulator não está configurado neste computador; confirme resultados no Console/Hosting após publicar. Não habilite permissões abertas como `allow read, write: if true` para resolver mensagens de permissão.

