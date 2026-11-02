# Innovation Hotspot Scoring Rubric

Use this rubric to score each candidate domain on a 0.0-1.0 scale before computing the Innovation Hotspot Score (IHS).

## Formula

```text
IHS = (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * Confidence
```

Defaults: `wv=1.20`, `wp=1.50`, `wa=1.35`, `Confidence=0.85`

## 1) VarianceNuance (V)

Score how much architecture nuance and branching complexity exists.

- `0.00-0.20`: mostly straightforward, low branching, stable contracts
- `0.21-0.40`: some edge cases, moderate integration nuance
- `0.41-0.60`: frequent tradeoffs, multiple flow variants, notable coupling
- `0.61-0.80`: high ambiguity, hidden dependencies, brittle seams
- `0.81-1.00`: very high uncertainty, conflicting constraints, unresolved architecture boundaries

Evidence signals:

- Number of cross-module touchpoints
- Frequency of conditional paths and special-case logic
- Incident history tied to this domain

## 2) PotentialValue (P)

Score expected upside if the domain is improved.

- `0.00-0.20`: low measurable upside
- `0.21-0.40`: modest local gains
- `0.41-0.60`: meaningful team or user impact
- `0.61-0.80`: major reliability/velocity/cost wins
- `0.81-1.00`: strategic leverage, differentiated capability, or large risk reduction

Value vectors:

- Reliability and failure-rate reduction
- Developer velocity and maintenance cost
- User experience and product outcomes
- Strategic differentiation

## 3) InverseAttention (IA)

Compute `IA = 1 - AttentionDepth`.

First score `AttentionDepth` on 0.0-1.0:

- `0.00-0.20`: little/no prior investment, no robust architecture in place
- `0.21-0.40`: early exploration, partial docs, narrow solution coverage
- `0.41-0.60`: moderate investment with visible gaps
- `0.61-0.80`: substantial architecture and iterative refinement
- `0.81-1.00`: deeply explored with overlapping solutions and mature controls

Then invert to prioritize neglected areas.

## 4) Confidence (C)

Scale confidence by evidence quality.

- `0.90-1.00`: strong evidence (code references, incidents, metrics)
- `0.75-0.89`: good evidence with minor gaps
- `0.50-0.74`: partial evidence, assumptions still active
- `<0.50`: weak evidence; do not finalize plan without targeted discovery

## Tie-Breaking

When IHS values are close:

1. Prefer stronger confidence
2. Prefer lower migration risk for first wave
3. Prefer options with cross-domain leverage

## Calibration Steps

1. Start with defaults
2. Raise `wp` when business outcomes dominate
3. Raise `wa` when innovation debt and blind spots dominate
4. Lower confidence when evidence quality is weak
5. Re-rank and review with the user

## Output Table Template

```text
| Domain | V | P | IA | C | IHS | Notes |
|--------|---|---|----|---|-----|-------|
| ...    |   |   |    |   |     | file:line evidence |
```

## Guardrails

- Do not hide low confidence; make uncertainty explicit
- Do not prioritize novelty over measurable leverage
- Do not finalize migration sequencing while critical unknowns remain
