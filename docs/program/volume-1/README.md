# Volume 1 — Current-State Qualification and Repository Convergence

Volume 1 establishes the factual ground beneath the program: what exists, what is
authoritative, what is reusable, what must be redesigned, and what must be retired.
It qualifies the current state; it does **not** implement product functionality and
does **not** author the master development plan.

Volume 1 inherits, unchanged, all controls ratified in Volume 0 (the Program
Constitution), frozen at tag `central-registration-volume-0-v1.0.0`
(merge commit `d897b13`). Volume 1 must not modify any Volume 0 artifact.

## Package 1 — Qualification Framework and Source Control

This package builds the machinery that governs the assessment. Substantive
qualification of any source does not begin here.

### Framework chapters

- [V1-00 Volume Control and Inheritance](V1-00-volume-control-and-inheritance.md)
- [V1-01 Qualification Methodology](V1-01-qualification-methodology.md)
- [V1-02 Source and Evidence Model](V1-02-source-and-evidence-model.md)
- [V1-03 Capability Disposition Standard](V1-03-capability-disposition-standard.md)
- [V1-04 Current-State Evidence Quality Standard](V1-04-current-state-evidence-quality-standard.md)

### Registers (`registers/`)

| Register | Purpose |
| --- | --- |
| REG-100 | Corpus index |
| REG-101 | Source inventory |
| REG-102 | Evidence register |
| REG-103 | Capability inventory |
| REG-104 | Finding register |
| REG-105 | Contradiction register |
| REG-106 | Qualification decision register |
| REG-107 | Volume 1 governance decision register |
| REG-108 | Volume 1 approval register |

### Vocabularies

- **Dispositions (8):** ADOPT, ADAPT, CONSOLIDATE, RETAIN, REBUILD, DEFER,
  EXTERNALIZE, RETIRE (V1-03).
- **Evidence ratings (5):** E0 UNSUBSTANTIATED, E1 INDICATIVE, E2 CORROBORATED,
  E3 DEMONSTRATED, E4 PROVEN (V1-04).
- **Source classifications (8):** policy truth, operational truth, implementation
  truth, vendor claim, observed evidence, stakeholder statement, assumption,
  unresolved contradiction (V1-02).

### Governance toolchain

Volume 1 is validated by self-contained executable controls under `controls/`,
mirroring the Volume 0 framework so the frozen Volume 0 corpus is never coupled to
Volume 1 assessment work:

```
npm run governance:check:v1     # schema, uniqueness, references, ratification, freeze
npm run governance:report:v1    # regenerate the non-authoritative control report
```

The Markdown chapters, YAML registers, JSON schemas, and control scripts are
authoritative. The generated control report is a non-authoritative projection.

### Gate V1-G1 — Qualification System Ready

Gate V1-G1 confirms the qualification system is ready before substantive
qualification begins (conditions in [V1-01 §V1-01.8](V1-01-qualification-methodology.md)).
It is an internal-progression gate authorized by the Accountable Program Authority;
executive organizational acceptance (D0) remains a distinct, pending condition.
