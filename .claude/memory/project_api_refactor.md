---
name: API Uniformity & New Packages Refactor
description: Comprehensive plan to unify APIs across autk-db/map/compute/plot, create autk-types and autk-core, and align code with the paper's intended public API
type: project
---

Ongoing initiative to fix 30 API inconsistencies across the four packages and introduce two new shared packages.

**Why:** APIs grew inconsistently; the published paper defines a cleaner feature-centric API that the code doesn't yet match. Target: make all packages uniform, align with paper examples, prepare autk-types and autk-core.

**How to apply:** All refactor work should follow the execution plan in .claude/api-uniformity-and-shared-packages.md and the discussion summary. Every breaking change is intentional; the goal is a clean v2 API.
