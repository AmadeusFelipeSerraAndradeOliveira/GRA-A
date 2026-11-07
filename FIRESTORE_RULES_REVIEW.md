# Revisão das regras do Firestore

## Escopo

- `admins/{uid}`: cada usuário pode consultar o próprio registro para confirmar o papel. Criação, alteração e remoção ficam negadas ao cliente; autorizações são administradas no Console ou por Admin SDK.
- `products` e `categories`: leitura pública somente quando `active == true`; administradores também consultam rascunhos/inativos. Apenas administradores podem criar ou editar; exclusão é negada. Campos, tipos, limites, tamanhos e referências de imagem são verificados.
- `orders`: criação permitida apenas para a sessão autenticada indicada no próprio documento, inclusive sessão anônima do checkout. A regra aceita até seis combinações, compara nome, variação e preço ao produto atual e recalcula o total em centavos. Um novo pedido sempre começa em `Aguardando confirmação`, com `stockApplied: false`. Leitura é restrita ao proprietário ou administrador; exclusão é negada.
- `orders` atualização: apenas administradores podem avançar por transições definidas. As regras validam o documento completo, preservam os dados e o prefixo do histórico e conferem os indicadores de estoque. O código do painel confirma/cancela em transação, lendo o pedido e todos os produtos antes de atualizar estoque e status juntos. Só o administrador altera estoque.
- `customers`: leitura pelo titular ou administração; criação e atualização limitadas ao perfil do titular e validadas por esquema. E-mail, UID e data de cadastro são imutáveis para o cliente. Exclusão negada.
- `messages`: qualquer sessão autenticada pode criar uma mensagem com limites de tamanho; somente administradores listam/leem e mudam o estado, sem alterar conteúdo ou identidade do remetente. Exclusão negada.
- `coupons` e `campaigns`: rascunhos ficam administrativos; conteúdo publicado só pode ser lido por membro autenticado, verificado e não anônimo. Exclusão negada.
- `settings/cloudinary`: o endereço público do Worker é legível; somente administradores o alteram. Nenhum segredo Cloudinary é salvo no Firestore ou navegador.
- Qualquer coleção/caminho não listado é negado por padrão.

## Casos de abuso avaliados

1. Visitante tenta ler o pedido de outra pessoa: bloqueado porque a consulta deve restringir `uid` à sessão, e leitura individual compara o proprietário.
2. Visitante tenta se promover a administrador: bloqueado porque `admins` não aceita escrita do cliente; a regra de administrador deriva somente da custom claim ou existência de documento controlado por Console/Admin SDK.
3. Cliente envia preço ou total alterado: bloqueado pela comparação dos itens com os preços atuais do catálogo e pela soma do total no Rules Engine.
4. Visitante tenta baixar estoque ao criar uma solicitação: bloqueado porque criação exige status inicial e `stockApplied: false`; clientes não podem atualizar produtos ou pedidos.
5. Dois administradores confirmam a mesma reserva ao mesmo tempo: a transação do app é repetida pelo Firestore após conflito; a segunda leitura vê estoque/status atualizado e falha se não houver saldo.
6. Cliente tenta apagar histórico de pedidos, clientes, produtos ou mensagens: bloqueado explicitamente.
7. Visitante tenta ler contato, endereço, e-mail ou WhatsApp de terceiros: bloqueado por leitura administrativa/proprietária das coleções privadas.
8. Cliente tenta ler cupom de rascunho ou entrar na VIP como visitante anônimo: bloqueado pelo status publicado, autenticação, confirmação de e-mail e tipo de provedor.
9. Visitante consulta produto ou categoria inativa: bloqueado pela condição de publicação da consulta; o painel administrativo pode consultar todos.
10. Cliente tenta alterar o histórico, total ou itens de uma reserva: bloqueado pela validação completa do registro e imutabilidade dos campos originais.

## Validação e limites

`npm run build` confirma a sintaxe JavaScript e os arquivos da aplicação, mas não compila regras. A tentativa de iniciar o Firebase Emulator Suite não avançou porque Java não está instalado/disponível no PATH desta máquina. Portanto, publique as regras somente depois de executá-las com o Emulator Suite e casos positivos/negativos em ambiente local ou de teste, antes de colocá-las na base real.

As regras são um protótipo e ainda precisam de compilação e testes positivos/negativos no Emulator Suite. Só administradores escrevem estoque, mas alterações manuais diretas no Console podem contornar o fluxo transacional. O fluxo anônimo pode receber spam; App Check e limitação de taxa não estão configurados. Registros antigos continuam legíveis, mas formatos da integração anterior não podem ser atualizados pelo fluxo novo.

## Aviso de protótipo

As regras foram preparadas para proteger os dados com acesso por proprietário/administrador, validação de preço/total e negação por padrão. Revise-as e confirme-as no Emulator Suite antes de publicar amplamente. Posso ajudar a endurecê-las depois dos resultados desses testes.

