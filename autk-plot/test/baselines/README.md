# Baselines

Outputs of the original autk-plot 4.1.1 (autark commit `3f8b31c`) for the cases
in `../baseline-cases.ts`. The tests compare this package against them, so the
equivalence with the original package keeps being checked after its sources
were replaced.

- `transforms.json`: `run()` for every transform preset used by the gallery,
  and `reduceBuckets()`. Recorded in Node; checked by `baseline-transforms.test.ts`.
- `interactions.json`: marks, selection and emitted selections after each step
  of the gallery plot examples (clicks, brushes, external selections). Recorded
  in Chrome, where brushes use the real SVG geometry; checked by
  `baseline-render.browser.ts`.

They were recorded once from the original sources with the same cases and
`replay()`; they are not regenerated from this package.
