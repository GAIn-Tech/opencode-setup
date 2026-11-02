# Decisions - Bounded Portability & Integrity Guarantee

## Architecture Decisions
1. **Support-floor contract**: Explicit OS/version/arch/Bun version contract
2. **Hermeticity**: Enforce deterministic env baselines (LC_ALL, TZ, temp/cache roots)
3. **Supply-chain trust**: Fail-closed with time-bound exception path
4. **Determinism**: Re-run identical scenarios for stable normalized outputs
5. **Restore-drill**: Automated script with RTO/RPO evidence
6. **Privilege governance**: Dual approval + immutable audit
7. **Tamper-evidence**: Hash chain/signature for critical events
8. **CI blocking**: Required checks for both tiers (current + previous stable)
9. **Report aggregation**: Confidence claim only with sufficient evidence
10. **Governance ADR**: Explicit ownership and waiver process