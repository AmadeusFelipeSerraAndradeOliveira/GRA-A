# Revisão das regras Firestore

As regras deste projeto são destinadas ao Firebase Standard/Native `graca-454ff` e ao uso de Authentication, Firestore e Hosting no plano Spark.

## Controles incluídos

- Acesso administrativo exige e-mail verificado e uma custom claim `admin` ou documento `admins/{uid}`; usuários não podem conceder esse papel a si próprios.
- Catálogo publicado é legível pela loja. Criação e edição continuam restritas ao painel autorizado; custos ficam em `productCosts`.
- O estoque pode ser registrado por variação em `stockBySize`; cada solicitação é validada para o tamanho escolhido, e a soma é baixada/restaurada quando a equipe confirma/cancela a reserva. Produtos antigos sem esse mapa usam o estoque legado apenas na primeira variação até o administrador distribuir as quantidades.
- Reserva é criada como pedido pendente, com itens, preço e quantidade comparados ao catálogo atual. A criação precisa vir no mesmo lote de gravação que o limite por número de WhatsApp.
- Mensagem de contato precisa vir no mesmo lote que o limite por e-mail. Esses dois limitadores não têm leitura nem listagem pública; uma sessão anônima diferente ainda encontra o tempo de espera quando reutiliza o mesmo contato.
- Alterações administrativas de pedido preservam identidade, itens, total, endereço e histórico anterior. A baixa/restauração de estoque ocorre separadamente e só com conta administrativa.
- A operação normal não oferece exclusão individual de pedidos. O fluxo excepcional `REDEFINIR SITE` cria um marcador de 10 minutos após reautenticação recente; somente esse marcador libera a exclusão de pedidos, categorias, configurações e limitadores. A aplicação exige exportação JSON e confirmação digitada, e preserva `customers`, usuários do Firebase Authentication e `admins`; o marcador é removido no fim. Ele também apaga produtos, custos, mensagens, cupons, campanhas e VIPs. A exportação deve ser guardada pelo proprietário antes da confirmação final.
- O reset pode remover o histórico financeiro e pedidos do banco. Nenhuma limpeza automática após 35 dias existe. A regra também permite que administradores listem os limitadores apenas para exportar e limpar os registros durante a redefinição.

## Limite de abusos sem servidor

O intervalo no Firestore é por telefone de reserva e e-mail do contato, além do limite local no navegador e do campo anti-robô. Esse desenho dificulta a troca de sessão anônima, mas não bloqueia alguém que invente números/e-mails diferentes ou contorne o cliente. O plano Spark não oferece uma função server-side para aplicar limite confiável por endereço IP. Não apresentar esse mecanismo como defesa completa contra bots.

## Verificação pendente

As regras devem ser validadas no Firebase Emulator ou pelo validador de implantação antes de tráfego amplo. O Emulator não está configurado neste computador; confirme resultados no Console/Hosting após publicar. Não habilite permissões abertas como `allow read, write: if true` para resolver mensagens de permissão.

