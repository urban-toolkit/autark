# Revisão dos PRs de Fabio Miranda

Data: 2026-10-01 (UTC). Repositório: [urban-toolkit/autark](https://github.com/urban-toolkit/autark). Autor identificado: [`fabio-miranda`](https://github.com/fabio-miranda).

## Escopo e método

Foram revisados **os cinco PRs abertos** desse autor na consulta ao GitHub: #101, #102, #103, #105 e #107. PRs fechados ou já integrados não fazem parte deste relatório.

A análise incluiu descrições, diffs completos, código relacionado da base e resultados dos checks do GitHub. A base comum era `77c8b32108c90d4f949519771540d152dfda83a6`. Os testes foram executados em cópias temporárias dos commits, com Node 26.0.0, Vitest 5.0.0 instalado separadamente e dependências locais reutilizadas. Não houve checkout de branches, alteração de código no repositório, commits ou pushes.

Classificação:
- **Must fix:** defeito bloqueante confirmado.
- **Should fix:** correção ou esclarecimento recomendado antes da integração.
- **Observações:** contratos, limites e lacunas de validação; não equivalem a bugs confirmados.

## Resumo

| PR | Tema | Validação local | Parecer |
|---|---|---|---|
| [#101](https://github.com/urban-toolkit/autark/pull/101) | Footprint de edifícios como GEOMETRY | 9/9 testes passaram | Favorável, com atenção à contagem por parte |
| [#102](https://github.com/urban-toolkit/autark/pull/102) | Imports publicados de autk-core | Build local impedido por dependências de tipos | Favorável pela inspeção; validação local incompleta |
| [#103](https://github.com/urban-toolkit/autark/pull/103) | Contagem de matches no spatial join | 2/2 testes passaram | Favorável |
| [#105](https://github.com/urban-toolkit/autark/pull/105) | Arrays/matrizes globais em storage buffers | 3/3 testes passaram | Favorável, com ressalvas de validação GPU |
| [#107](https://github.com/urban-toolkit/autark/pull/107) | Carregamento OSM por bbox | 8/8 testes originais passaram; caso adicional falhou | Esclarecer/corrigir o contrato espacial antes de integrar |

Todos os cinco PRs tinham o check de CI concluído com **success** na consulta. Não foram identificados achados classificados como Must fix.

## PR #101 — `fix(db): store building agg_geometry as GEOMETRY`

Commit revisado: `f494891a8b1545c3de5d81cbe28288edcc1ac51d`.

### Achados

**Nenhum defeito bloqueante identificado.** A mudança para `GEOMETRY` permite que a seleção da coluna geométrica reconheça o footprint agregado. O fallback com `COALESCE(agg.agg_geometry, b.geometry)` evita perder partes quando a união falha. A contagem de falhas ocorre antes desse fallback, preservando o aviso.

Evidências: [`queries.ts`, linhas 101 e 164](https://github.com/urban-toolkit/autark/blob/f494891a8b1545c3de5d81cbe28288edcc1ac51d/autk-db/src/internal/process-osm-buildings/queries.ts#L101); `use-case.ts`, movimentação da consulta de geometrias ausentes antes da criação da tabela final.

### Observações

- **O match passa a usar o footprint, mas a unidade de contagem continua sendo a parte.** O teste `matches by footprint when buildings are the join table` espera explicitamente `2` para um ponto em um edifício com duas partes. Isso é uma mudança relevante para aplicações que interpretam o resultado como “número de edifícios”. Está explicado na descrição do PR e não é um defeito oculto; merece documentação de usuário/release notes.
- O teste de falha de união injeta uma exceção na conexão: valida o fallback, não reproduz uma falha topológica real do GEOS.

**Validação:** nove testes passaram, incluindo tipo da coluna, união de partes, exportação, INTERSECT, NEAR com centroides, agregação e fallback.

**Parecer:** favorável. Não condicionar a aprovação a uma mudança para contagem distinta de edifícios: isso seria outro contrato e outro escopo.

## PR #102 — `fix(build): keep the core alias out of published types`

Commit revisado: `2a551f37e160cd76477882ae35548bb84d601195`.

### Achados

**Nenhuma regressão concreta identificada.** `aliasesExclude` é aplicado à geração de declarações nos quatro pacotes dependentes, sem modificar os aliases usados no bundle JavaScript. A mudança é pequena e direcionada ao problema de publicação descrito.

### Observações

- **A nova validação cobre imports/exports com `from`, não toda referência possível a outro pacote local.** Em [`validate-packages.mjs`, linha 68](https://github.com/urban-toolkit/autark/blob/2a551f37e160cd76477882ae35548bb84d601195/.github/scripts/validate-packages.mjs#L68), a expressão `/from\s+['"]([^'"]+)['"]/g` não reconhece, por exemplo, `import('../../outro-pacote/...')` em um tipo ou uma referência triple-slash. Isso não invalida a correção atual, mas significa que o check não garante integralmente a regra anunciada no comentário. Não foi encontrado um vazamento dessa natureza introduzido pelo PR.
- A validação verifica escape do diretório do pacote, mas não comprova que cada referência interna relativa estará presente no tarball. Um teste consumidor sem aliases/workspaces seria uma proteção complementar mais completa.
- O bundle de autk-core continuar incorporado aos bundles dependentes é explicitamente deixado fora do escopo. Não foi tratado como regressão deste PR.

**Validação:** tentei `make build` em uma cópia temporária. O build parou em autk-core por resolução de tipos (`geojson`, `d3-color`, `d3-format`, `d3-scale`, `earcut`, entre outros) no ambiente de dependências reutilizadas. `validate:packages` não chegou a executar. Esses erros não demonstram um defeito do PR; o CI do commit passou. Não reproduzi localmente a contagem de declarações ou o teste consumidor mencionados pelo autor.

**Parecer:** favorável pela inspeção, com validação local de empacotamento incompleta.

## PR #103 — `fix(db): count join matches, not rows, for count('*')`

Commit revisado: `c053f976d7eb4b4754ba918ff5461bdc97345133`.

### Achados

**Nenhuma regressão concreta identificada.** A troca de `COUNT(*)` por `COUNT(<geometria do join>)` corrige a linha artificial preservada pelo LEFT JOIN: sem match, a geometria do lado direito é NULL e o resultado passa a ser zero.

Evidência: [`queries.ts`, linha 367](https://github.com/urban-toolkit/autark/blob/c053f976d7eb4b4754ba918ff5461bdc97345133/autk-db/src/use-cases/spatial-join/queries.ts#L367). A referência usa o contexto efetivo da tabela do join; a inspeção também confirmou o uso do alias `csv_candidates` no caminho NEAR.

### Observações

- Os testes cobrem um match e ausência de matches, além da preservação de `count` em coluna nomeada. Não cobrem múltiplos matches, NEAR, normalização ou o uso de `agg_geometry`; seria útil acrescentar esses casos, sem considerar sua ausência uma falha comprovada.
- Em conjunto com #101, `count('*')` conta partes que deram match, não edifícios distintos. As duas correções são compatíveis, mas não devem ser apresentadas como uma contagem de edifícios únicos.

**Validação:** dois testes passaram; resultado esperado `[1, 0, 0]` confirmado para os dois caminhos testados.

**Parecer:** favorável; correção bem delimitada.

## PR #105 — `fix(compute): read uniform arrays and matrices from storage buffers`

Commit revisado: `fdddab989ad74220afb4e3f304ad9001e2a856ed`.

### Achados

**Nenhuma regressão concreta identificada nos caminhos testados.** A geração do shader e o dispatch mudam de forma consistente: arrays/matrizes globais são declarações de storage somente leitura, enquanto escalares continuam uniforms. Os parâmetros de dimensão permanecem em `compute_value`, e os dados são enviados pelo binding correspondente.

### Observações

- **Os testes novos não compilam nem executam WGSL.** O mock intercepta `runCompute`; eles comprovam strings do shader, classes dos buffers e parte dos dados, mas não resultados numéricos na GPU. Os testes manuais NVIDIA/Apple descritos no PR são evidência do autor, não reproduzida nesta revisão.
- Cada array/matriz global passa a consumir um slot de storage. Solicitar `maxStorageBuffersPerShaderStage` do adapter amplia a capacidade disponível, mas não elimina o limite. Workloads com muitos atributos, globais e outputs merecem um teste de limite e erro explícito; não foi demonstrada uma falha desse tipo nesta revisão.
- O caráter somente leitura está na descrição do PR, mas não está explicitado nos comentários públicos de `uniformArrays`/`uniformMatrices` em `autk-compute/src/api.ts`, linhas 148–152. Recomendo documentar esse contrato junto à API, incluindo as dimensões disponíveis no corpo WGSL.
- A ausência de captura robusta de erros de pipeline relatada pelo autor não é resolvida por este PR. Não foi contabilizada como um novo defeito.

**Validação:** três testes passaram: array global com 3.000 floats, matriz global e escalar uniform. Não houve execução em navegador/WebGPU nesta revisão.

**Parecer:** favorável à abordagem; manter a ressalva de que os testes automatizados verificam geração, não execução GPU.

## PR #107 — `feat(db): load OSM for a bounding box`

Commit revisado: `c647f64f0229acbe4119e919f4192efda2f1d0a1`.

O diff contra main inclui #103 e sua infraestrutura de testes. O achado abaixo diz respeito à funcionalidade nova de bbox, não à contagem herdada.

### Should fix — O contrato de recorte não é garantido para edifícios multipolígonos

**Evidência:** [`buildBoundingBoxQuery`, linha 711](https://github.com/urban-toolkit/autark/blob/c647f64f0229acbe4119e919f4192efda2f1d0a1/autk-db/src/use-cases/load-osm-overpass/use-case.ts#L711) expande relações com `way(r.dataRelations)->.dataRelationWays;`, sem filtro espacial nos membros. Isso é necessário para reconstruir geometrias completas, mas também traz partes fora da caixa.

A documentação nova de [`queryArea`, linhas 95–97](https://github.com/urban-toolkit/autark/blob/c647f64f0229acbe4119e919f4192efda2f1d0a1/autk-db/src/use-cases/load-osm-overpass/interfaces.ts#L95) afirma que as camadas são recortadas à bbox. Entretanto, `AutkDb.loadOsm` não passa bbox à construção de edifícios (`db.ts`, linhas 332–340). O clipping final depende de solicitar `surface` e, para edifícios, apenas filtra geometrias que intersectam a superfície, sem cortar sua geometria (`db.ts`, linhas 368–371 e 1028–1038). Portanto, a fronteira sintética por si só não garante esse contrato.

**Reprodução local:** em uma cópia temporária do teste do PR, a resposta simulada incluiu uma relação `type=multipolygon, building=yes` com duas ways externas: uma dentro da caixa e outra inteiramente fora. A segunda foi construída deslocando latitude e longitude da primeira em +1 grau, com IDs próprios. A chamada usou apenas `layers: ['buildings']` e o workspace foi configurado em `EPSG:4326` para comparar coordenadas diretamente. O GeoJSON exportado manteve a parte externa: latitude máxima **43.0527**, para uma caixa cuja latitude norte é **42.06**. A asserção de limite falhou. Não foi uma consulta a um servidor Overpass real; foi uma resposta simulada compatível com a expansão de membros que o código solicita.

**Impacto:** um consumidor que baixa a área escolhida pode receber componentes inteiramente fora dela. A fixture original tem apenas um edifício interno e não detecta esse caso.

**Recomendação:** definir explicitamente se bbox significa seleção de objetos completos ou recorte geométrico. Se for seleção de objetos completos, ajustar a promessa pública e documentar partes externas. Se for recorte, implementar a política correspondente sem depender de o consumidor pedir `surface`. Preservar edifícios completos pode ser desejável, mas precisa estar refletido no contrato. Acrescentar um teste de relação com componente fora da caixa.

### Observações

- O filtro bbox de Overpass seleciona elementos, não equivale a uma interseção geométrica exaustiva. A documentação oficial explica que ways/relações podem se estender além dos limites, especialmente após recursão. Não prometer cobertura de “tudo que intersecta a caixa” sem definir essas limitações. Fonte: [Overpass QL — Global bounding box](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#Global_bounding_box_(bbox)).
- A validação de coordenadas ocorre antes de pedidos HTTP; o formato `[west, south, east, north]` e a conversão para a ordem Overpass estão consistentes. Caixas cruzando o antimeridiano são rejeitadas pelo contrato `west < east`, explicitado no PR.
- O teste de área nomeada verifica a consulta inicial e o erro de fronteira ausente, não um carregamento nomeado completo bem-sucedido.
- A falha de camada de edifícios vazia é declarada pelo autor como preexistente. Não foi reclassificada como regressão desta mudança, mas é uma limitação importante para caixas arbitrárias escolhidas pelo usuário.

**Validação:** oito testes originais passaram (seis de bbox/área nomeada e dois herdados de #103). A fixture adicional identificou o comportamento espacial descrito acima.

**Parecer:** esclarecer/corrigir o contrato de bbox e adicionar a cobertura de membros externos antes de integrar.

## Integração e limites da revisão

1. **#107 depende de #103.** Integrar #103 antes, ou atualizar a base de #107 para que sua revisão mostre somente a funcionalidade de bbox.
2. #101, #103, #105 e #107 compartilham alterações equivalentes de infraestrutura Vitest. Mesmo que os patches sejam equivalentes, conferir a resolução da integração e executar a suíte combinada; esta revisão executou cada branch separadamente, não uma branch com todos os PRs integrados.
3. Nenhum resultado de CI substitui as lacunas indicadas: consumidor TypeScript isolado para #102, execução GPU para #105 e casos espaciais de fronteira para #107.
4. Os pareceres se referem aos SHAs registrados acima. Commits posteriores precisam de nova checagem.

**Único arquivo criado no repositório:** este relatório Markdown. Nenhuma correção foi aplicada ao código do checkout e nenhum commit ou push foi realizado.
