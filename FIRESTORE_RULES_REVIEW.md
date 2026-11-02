# Revisão das regras do Firestore

## Estrutura e acessos encontrados

- `admins/{uid}`: documento administrativo gerenciado manualmente no Console do Firebase. A existência do documento, ou a custom claim `admin: true`, autoriza o painel. O cliente autenticado pode consultar somente o próprio documento; nenhum cliente pode listar, criar, editar ou excluir documentos dessa coleção.
- `customers/{uid}`: perfil pertencente ao usuário autenticado, com `uid`, `name`, `email`, `phone`, `address`, `createdAt` e `updatedAt`. O usuário pode ler o próprio perfil, criar um perfil com o próprio UID e alterar apenas nome, telefone, endereço e data de atualização. Exclusão é negada.
- `products/{productId}`: catálogo público necessário à vitrine. Apenas administrador cria/edita; exclusão é negada. O documento valida nome, preço, estoque, tamanhos, ativo e campos opcionais de desconto, custo e estoque reservado.
- `orders/{orderId}`: escrita de criação e atualização de pagamento feita pelas Cloud Functions com Admin SDK. O cliente lê apenas seus pedidos; administrador pode alterar status e data de atualização. Exclusão é negada.
- `coupons/{couponCode}`: consulta e manutenção reservadas a administradores. Criação e atualização validam os campos permitidos; exclusão é negada.

O código do navegador lê `admins/{uid}` com `getDoc` e acompanha `orders/{orderId}` com `onSnapshot`. Catálogo, painel, clientes e relatórios ainda têm dados locais no `localStorage`. As Cloud Functions usam Admin SDK para `products`, `coupons` e `orders`, portanto essas operações de servidor não são limitadas pelas regras do cliente.

## Revisão de caminhos de escalada

- Visitante sem login: catálogo público somente leitura; documentos privados e dados administrativos permanecem bloqueados.
- Usuário autenticado: pode consultar somente o próprio documento de função e o próprio pedido/perfil; a regra não permite escrever na coleção `admins` nem excluir clientes ou pedidos.
- Tentativa de autoelevação: gravar `admins/{uid}` pelo navegador falha porque create/update estão negados; a concessão deve vir do Console Firebase ou de processo confiável com Admin SDK.
- Alterar status de pedido: usuário comum não pode editar pedidos; administrador só pode alterar os campos `status` e `updatedAt` e usar os estados permitidos.
- Listar `admins`: negado; a tela verifica apenas o documento do UID autenticado.

Esta revisão é estática. A sintaxe e o comportamento final das regras precisam ser validados no Firebase Emulator ou com `firebase deploy --only firestore:rules` antes de considerar o painel disponível no site publicado.
