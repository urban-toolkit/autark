# Revisão do PR pendente de Fabio Miranda

Atualizado em **2026-10-06, 23:34 UTC**. Repositório: [urban-toolkit/autark](https://github.com/urban-toolkit/autark). Autor: [`fabio-miranda`](https://github.com/fabio-miranda).

## Escopo e método

Este relatório contém somente a **PR #111, a única ainda aberta** do autor. As discussões e referências a PRs já resolvidas foram removidas.

A consulta atual ao GitHub confirmou o estado aberto, o SHA e o check de CI registrados abaixo. Os achados e testes são os da revisão histórica contra o `main` `ce2a0371695bf05df9ae1e4a112d9e5f5c025718`; não foram reexecutados nesta atualização documental. O branch carrega uma pilha histórica baseada em `77c8b32108c90d4f949519771540d152dfda83a6`, portanto seu diff completo não representa apenas funcionalidades novas em relação ao `main` atual.

Na revisão histórica, as verificações foram executadas em cópias temporárias, sem checkout de branches, reutilizando dependências locais e Vitest 5.0.3. Os testes OSM usaram DuckDB nativo e respostas Overpass simuladas; não houve validação contra um servidor Overpass real. A futura adaptação deve ser feita sobre o `main` atual, `735b213ac6d323b84819ca00d14183be0a45ec5e`, que já inclui exportação por elemento com proveniência explícita, grade de precisão e recortes transacionais.

Classificação:
- **Must fix:** defeito confirmado que deve ser corrigido antes da integração.
- **Should fix:** adaptação ou validação recomendada antes da integração.
- **Observações:** contratos e limites; não equivalem a regressões confirmadas.

## Resumo

| PR | Tema | Validação desta revisão | Parecer |
|---|---|---|---|
| [#111](https://github.com/urban-toolkit/autark/pull/111) | Camadas selecionadas por tags OSM | 34/34 testes da pilha passaram; reprodução espacial adicional falhou | Corrigir seleção espacial e adaptar à pipeline atual |

O check de CI da PR #111 está concluído com **SUCCESS** na consulta atual. Isso não elimina o achado espacial adicional nem substitui a validação da adaptação ao `main` atual.

## PR #111 — `feat(db): load OSM features chosen by tags as point, line and polygon layers`

Commit revisado: [`367b0c818604939099a2eeac45cbe989778832a9`](https://github.com/urban-toolkit/autark/commit/367b0c818604939099a2eeac45cbe989778832a9).

### Funcionalidade proposta

`tagSets` reúne filtros exatos de chave/valor, combinados por OR, e gera camadas de pontos, linhas e polígonos por conjunto. Preserva tags de nodes, classifica ways fechadas conforme `area` e a presença de tags lineares, monta relações multipolígonas e contém uma implementação histórica de exportação por elemento.

O head inclui também correções úteis para ordem dos elementos, tipagem explícita de `read_json` quando há muitos nodes antes de ways/relations e remoção de metadados de uma camada do mesmo conjunto que fica vazia após reload.

### Must fix — Membros auxiliares fora da seleção viram features independentes

A consulta busca `.tagHits` com filtros espaciais e expande os membros das relações multipolígonas para reconstruir sua geometria completa. Entretanto, a geração das tabelas aplica os filtros de tags a **todas as ways recebidas**, sem distinguir hits espaciais de membros auxiliares.

Evidências no SHA revisado: `autk-db/src/use-cases/load-osm-overpass/use-case.ts`, `buildTagSetQuery` (`way(r.tagAreas)->.tagAreaWays`); `autk-db/src/use-cases/load-osm-layer/tag-set-queries.ts`, `TAG_SET_TABLES_QUERY`, que seleciona ways pelo filtro de tags, sem identificação de `.tagHits` nem filtro espacial posterior.

**Reprodução:** em uma cópia temporária, carreguei bbox `[0, 0, 10, 10]`, somente `tagSets` para `amenity=school`, e uma resposta compatível com a expansão solicitada: relação multipolígona `relation/3`, uma outer way dentro da caixa (`way/1`) e outra completamente fora (`way/2`, coordenadas entre 20 e 21). Ambas tinham a tag selecionada. O resultado individual foi:

```text
['relation/3', 'way/1', 'way/2']
```

A asserção de que `way/2` não deveria surgir como uma **feature independente selecionada** falhou. Preservar essa componente na geometria completa de `relation/3` é compatível com seleção de objetos completos; promover o membro externo a outro objeto selecionado é um problema distinto.

**Impacto:** a camada pode conter objetos inteiramente fora da área pedida, baixados apenas para reconstruir outra feature. Os 34 testes originais da pilha não detectam o caso.

**Recomendação:** conservar a identidade dos hits selecionados separadamente dos elementos auxiliares, ou aplicar uma seleção espacial explícita antes de exportar cada objeto independente. Não cortar arbitrariamente componentes de uma relação selecionada. Acrescentar a regressão de relação com membro externo também tagueado em `autk-db/test`.

### Should fix — Integrar com a pipeline atual, não restaurar a antiga

O branch usa a pipeline OSM antiga em `AutkDb.loadOsm` e condiciona a criação de surface às camadas solicitadas. No `main`, surface é obrigatória, pode ser interna, incorpora a máscara costeira e alimenta o recorte das camadas existentes.

Acoplar `tagSets` à pipeline atual, definindo explicitamente se cada camada representa objetos completos ou geometrias recortadas. Preservar superfície interna, transações, comportamento de workspace e a política de warn/skip para elementos individuais inválidos. Também preservar a consolidação atual dos edifícios e a proveniência explícita usada por `getLayer(name, { osmElements: true })`, sem restaurar a inferência de tipo OSM por `refs`.

### Observações

- `tagSets` é recusado explicitamente com `pbfFileUrl`. Não é uma falha silenciosa; documentar que o novo modo é Overpass-only ou planejar suporte PBF separadamente.
- Nodes solicitados com `out body` conservam tags, e a deduplicação faz o node explícito prevalecer sobre sua cópia geométrica de uma way. Os testes incluem IDs numéricos compartilhados entre tipos OSM.
- A tipagem explícita do JSON evita depender de uma amostra inicial formada só por nodes. Preservar essa correção ao adaptar o carregador.
- Cache é distinguido pelos seletores; o PR evita responder pedidos de tags com o cache comum sem nodes tagueados. Preservar também a versão e os contratos atuais do cache.
- O reload remove as camadas vazias do mesmo conjunto. Conferir isso contra os metadados e índices da implementação atual antes de portar a remoção.
- As regras de classificação de ways são uma política limitada, não uma classificação universal de todas as tags OSM. Documentar `area=yes/no`, as tags lineares consideradas, a regra padrão que transforma outras ways fechadas em polígonos e a exclusão de relações não multipolígonas.

**Validação:** todos os **34 testes de cinco arquivos** de `autk-db/test` passaram no head de #111, incluindo cobertura herdada de exportação, áreas nomeadas e bbox. Um teste adicional, separado, reproduziu o achado espacial acima e falhou como esperado. As respostas eram simuladas; não houve pedido real ao Overpass.

**Parecer:** a funcionalidade é útil, mas não integrar sem corrigir a promoção de membros externos e adaptar à pipeline atual.

## Próxima etapa e limites

Adaptar **somente `tagSets` da PR #111** à pipeline atual, corrigindo a promoção indevida de membros externos e mantendo surface obrigatória, proveniência OSM explícita, grade de precisão, transações e consolidação dos edifícios. Separar os patches úteis da pilha histórica para não reintroduzir implementações superadas.

O parecer se refere ao SHA revisado. Não foi testada uma integração desse patch com o `main` atual; os testes da pilha antiga não substituem essa verificação.
