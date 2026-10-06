# Revisão dos PRs pendentes de Fabio Miranda

Atualizado em **2026-10-06, 17:45 UTC**. Repositório: [urban-toolkit/autark](https://github.com/urban-toolkit/autark). Autor: [`fabio-miranda`](https://github.com/fabio-miranda).

## Escopo e método

Este relatório contém somente os **três PRs ainda abertos** do autor: #105, #108 e #111. As discussões de PRs já resolvidos foram removidas.

A consulta ao GitHub confirmou os títulos, SHAs e checks registrados abaixo. A revisão confrontou os patches com o `main` utilizado na revisão, `ce2a0371695bf05df9ae1e4a112d9e5f5c025718`, e examinou os testes e o código relacionado. Os branches OSM ainda carregam uma pilha histórica baseada em `77c8b32108c90d4f949519771540d152dfda83a6`; seus diffs completos não representam apenas funcionalidades novas em relação ao `main` atual.

As verificações foram executadas em cópias temporárias, sem checkout de branches. Foram reutilizadas as dependências locais, com Vitest 5.0.3. Os testes OSM usam DuckDB nativo e respostas Overpass simuladas; não houve validação contra um servidor Overpass real nem execução WebGPU.

Classificação:
- **Must fix:** defeito confirmado que deve ser corrigido antes da integração.
- **Should fix:** adaptação ou validação recomendada antes da integração.
- **Observações:** contratos e limites; não equivalem a regressões confirmadas.

## Resumo

| PR | Tema | Validação desta revisão | Parecer |
|---|---|---|---|
| [#105](https://github.com/urban-toolkit/autark/pull/105) | Arrays/matrizes globais em storage buffers | 3/3 testes passaram; sem execução GPU | Favorável à abordagem, condicionado à validação WebGPU |
| [#108](https://github.com/urban-toolkit/autark/pull/108) | Exportação por elemento OSM | 4 testes específicos passaram na pilha de #111 | Útil, mas precisa ser adaptado ao modelo atual de edifícios |
| [#111](https://github.com/urban-toolkit/autark/pull/111) | Camadas selecionadas por tags OSM | 34/34 testes da pilha passaram; reprodução espacial adicional falhou | Corrigir seleção espacial e adaptar à pipeline atual |

Os três PRs tinham seus checks de CI concluídos com **SUCCESS** na consulta. Isso não elimina o achado adicional em #111 nem as lacunas de integração e execução GPU.

## PR #105 — `fix(compute): read uniform arrays and matrices from storage buffers`

Commit revisado: [`fdddab989ad74220afb4e3f304ad9001e2a856ed`](https://github.com/urban-toolkit/autark/commit/fdddab989ad74220afb4e3f304ad9001e2a856ed).

### Achados

**Nenhuma regressão concreta identificada nos caminhos testados.** A geração do shader e o dispatch mudam de forma consistente: arrays/matrizes globais passam a storage somente leitura; escalares permanecem uniforms. As dimensões continuam disponíveis em `compute_value`, e os dados acompanham os bindings correspondentes.

### Should fix — Validar compilação e resultados na GPU

Os testes interceptam `runCompute`: verificam strings WGSL, classes de buffers e dados enviados, mas **não compilam nem executam o shader**. Antes da integração, executar ao menos array global, matriz global e combinação com escalar, verificando resultados numéricos e ausência de erros de validação. Os testes NVIDIA/Apple descritos pelo autor não foram reproduzidos nesta revisão.

### Observações

- Cada array/matriz global passa a consumir um slot de storage. Solicitar `maxStorageBuffersPerShaderStage` do adapter não elimina o limite. Cobrir workloads próximos ao limite e excedidos, além de tamanho/alinhamento dos buffers.
- Documentar na API pública que `uniformArrays` e `uniformMatrices` são globais somente leitura, apesar do nome histórico, e explicar as dimensões acessíveis no corpo WGSL.
- A captura de erros de criação de pipeline é uma limitação anterior, não resolvida por este patch. Não foi contabilizada como regressão.

**Validação:** os três testes de `gpgpu-shader.test.ts` passaram no SHA de #105: array com 3.000 floats, matriz e escalar. Não houve execução em navegador/WebGPU.

**Parecer:** favorável à abordagem; não confundir teste de geração com validação real de GPU.

## PR #108 — `feat(db): export one feature per OSM element from getLayer on request`

Commit revisado: [`1c4e0f293fbbadc8f2238155341e39f3231fd6b2`](https://github.com/urban-toolkit/autark/commit/1c4e0f293fbbadc8f2238155341e39f3231fd6b2).

### Achados

**A opção é útil e opt-in.** `getLayer(name, { osmElements: true })` exporta features individuais com `osm_type` e `osm_id`, preservando tags; quando disponível, inclui também `building_id`. O formato agregado padrão permanece inalterado na base do PR.

### Should fix — Adaptar à consolidação atual dos edifícios

A implementação do PR reconhece tabelas OSM pelas colunas `id`, `refs` e `properties`, e deduz way/relation pelo comprimento de `refs`. Isso corresponde ao modelo antigo de linhas por parte.

No `main` atual, edifícios são consolidados em uma linha por building, com `GeometryCollection`, `properties.parts` e `geometryIndex`; a tabela final não conserva `refs`. Aplicar apenas o exportador do PR faria a detecção falhar e cair no formato agregado, sem entregar a exportação por elemento esperada para edifícios.

Evidências: [`isOsmElementTable` e `SELECT_OSM_ELEMENTS_GEOJSON_QUERY`](https://github.com/urban-toolkit/autark/blob/1c4e0f293fbbadc8f2238155341e39f3231fd6b2/autk-db/src/use-cases/get-layer/queries.ts#L107-L155); no `main`, `autk-db/src/internal/process-osm-buildings/queries.ts`, `COLLECT_BUILDING_PARTS_QUERY`.

**Recomendação:** decidir quais fontes de identidade/geometria alimentarão o modo por elemento e preservar explicitamente `osm_type` e `osm_id`. Não inferir apenas de `refs` nem desmanchar o contrato padrão de edifícios consolidados. Testar identidade, associação ao building e correspondência de `geometryIndex`.

### Observações

- A exportação individual do branch não usa o filtro `ST_IsValid` do formato padrão antigo. Ela pode expor geometrias inválidas já armazenadas. Isso é comportamento coberto pelo teste do autor, não um defeito oculto; não deve reintroduzir elementos que a pipeline atual deliberadamente omite com warning.
- IDs de node, way e relation pertencem a namespaces distintos. Preservar o par tipo/ID também no caminho por tags de #111.
- Tabelas derivadas que perderam identidade OSM recebem o formato comum. Documentar esse fallback para evitar que a opção pareça aplicável a qualquer tabela de origem OSM.

**Validação:** os quatro testes de `get-layer-osm-elements.test.ts` passaram na cópia de #111, que contém a implementação de #108. Cobrem agrupamento padrão versus individual, IDs/tags, geometria inválida e fallback não OSM. Isso **não valida a integração com o modelo atual do `main`**.

**Parecer:** implementar a ideia sobre a pipeline atual; não integrar a pilha antiga diretamente.

## PR #111 — `feat(db): load OSM features chosen by tags as point, line and polygon layers`

Commit revisado: [`367b0c818604939099a2eeac45cbe989778832a9`](https://github.com/urban-toolkit/autark/commit/367b0c818604939099a2eeac45cbe989778832a9).

### Funcionalidade proposta

`tagSets` reúne filtros exatos de chave/valor, combinados por OR, e gera camadas de pontos, linhas e polígonos por conjunto. Preserva tags de nodes, classifica ways fechadas conforme `area` e a presença de tags lineares, monta relações multipolígonas e incorpora a exportação por elemento de #108.

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

**Recomendação:** conservar a identidade dos hits selecionados separadamente dos elementos auxiliares, ou aplicar uma seleção espacial explícita antes de exportar cada objeto independente. Não cortar arbitrariamente componentes de uma relação selecionada. Acrescentar o teste de relação com membro externo também tagueado.

### Should fix — Integrar com a pipeline atual, não restaurar a antiga

O branch usa a pipeline OSM antiga em `AutkDb.loadOsm` e condiciona a criação de surface às camadas solicitadas. No `main`, surface é obrigatória, pode ser interna, incorpora a máscara costeira e alimenta o recorte das camadas existentes.

Acoplar `tagSets` à pipeline atual, definindo explicitamente se cada camada representa objetos completos ou geometrias recortadas. Preservar superfície interna, transações, comportamento de workspace e a política de warn/skip para elementos individuais inválidos. Também preservar os avanços de consolidação dos edifícios discutidos em #108.

### Observações

- `tagSets` é recusado explicitamente com `pbfFileUrl`. Não é uma falha silenciosa; documentar que o novo modo é Overpass-only ou planejar suporte PBF separadamente.
- Nodes solicitados com `out body` conservam tags, e a deduplicação faz o node explícito prevalecer sobre sua cópia geométrica de uma way. Os testes incluem IDs numéricos compartilhados entre tipos OSM.
- A tipagem explícita do JSON evita depender de uma amostra inicial formada só por nodes. Preservar essa correção ao adaptar o carregador.
- Cache é distinguido pelos seletores; o PR evita responder pedidos de tags com o cache comum sem nodes tagueados. Preservar também a versão e os contratos atuais do cache.
- O reload remove as camadas vazias do mesmo conjunto. Conferir isso contra os metadados e índices da implementação atual antes de portar a remoção.
- As regras de classificação de ways são uma política limitada, não uma classificação universal de todas as tags OSM. Documentar `area=yes/no`, as tags lineares consideradas, a regra padrão que transforma outras ways fechadas em polígonos e a exclusão de relações não multipolígonas.

**Validação:** todos os **34 testes de cinco arquivos** de `autk-db/test` passaram no head de #111, incluindo cobertura herdada de exportação, áreas nomeadas e bbox. Um teste adicional, separado, reproduziu o achado espacial acima e falhou como esperado. As respostas eram simuladas; não houve pedido real ao Overpass.

**Parecer:** a funcionalidade é útil, mas não integrar sem corrigir a promoção de membros externos e adaptar à pipeline atual.

## Ordem recomendada e limites

1. **#105:** validar execução WebGPU antes de integrar a mudança de bindings.
2. **#108:** definir identidade OSM no modelo atual e implementar exportação opt-in sem alterar o formato padrão.
3. **#111:** adicionar seleção por tags sobre essa base, corrigindo o achado espacial e mantendo surface obrigatória.

O branch de #111 contém a implementação de #108 e uma pilha histórica; separar os patches úteis para não reintroduzir implementações superadas.

Os pareceres se referem aos SHAs registrados. Não foi testada uma integração desses três patches com o `main` atual; os testes da pilha antiga não substituem essa verificação.
