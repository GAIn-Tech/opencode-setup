# Unified CLI Rich UI - Plan Review & Due Diligence

## Executive Summary

**Plan**: Unified CLI with Rich UI and Multi-Provider Support
**Scope**: Single-entry CLI with Hermes/SWE-agent-like TUI + 4 AI providers
**Estimated Effort**: 18 tasks, ~7 hours
**Risk Level**: MEDIUM (Textual framework dependency, multi-provider complexity)

---

## 1. REQUIREMENTS COVERAGE ANALYSIS

### Core Requirements - ✅ COMPLETE

| Requirement | Status | Plan Coverage | Notes |
|-------------|--------|---------------|-------|
| Single command entry (`hercules`) | ✅ | Task 5.1 | TTY detection for auto-TUI |
| Quick execution mode | ✅ | Task 5.1 | Args bypass TUI |
| Rich terminal UI | ✅ | Phases 1, 4 | Textual-based TUI |
| Split-pane layout | ✅ | Task 1.2 | File browser + chat panels |
| File browser | ✅ | Task 1.2 | Tree view component |
| Chat/terminal panels | ✅ | Task 1.2 | Separate components |
| Status/progress panel | ✅ | Task 1.2 | Status bar component |
| Command palette | ✅ | Task 4.3 | Ctrl+Shift+P quick actions |
| Syntax highlighting | ✅ | Task 4.1 | Markdown + code rendering |
| Diff viewer | ✅ | Task 4.2 | Side-by-side diffs |
| Live streaming output | ✅ | Task 4.1 | Real-time token streaming |

### Provider Support - ✅ COMPLETE

| Provider | Status | Plan Coverage | API Type |
|----------|--------|---------------|----------|
| OpenAI (ChatGPT/Codex) | ✅ | Task 2.2 | Official SDK |
| NVIDIA (NGC/NIM) | ✅ | Task 2.3 | OpenAI-compatible |
| OpenRouter | ✅ | Task 2.4 | OpenAI-compatible |
| OllamaCloud | ✅ | Task 2.5 | REST API |

**CRITICAL GAP IDENTIFIED**: None - all 4 providers covered

---

## 2. TECHNICAL DUE DILIGENCE

### Architecture Decisions

| Decision | Rationale | Risk |
|----------|-----------|------|
| **Textual Framework** | Industry standard for Python TUIs | MEDIUM - adds dependency |
| **OpenAI SDK for NVIDIA/OpenRouter** | Compatibility layer | LOW - standard approach |
| **Async Throughout** | Required for streaming | LOW - matches existing code |
| **Dataclass Config** | Type safety, serialization | LOW - Pythonic approach |

### Dependencies to Add

```python
# pyproject.toml additions needed:
textual>=0.44.0          # TUI framework
textual-dev>=1.0.0       # Development tools
# openai already included
# httpx already included
```

**VERIFICATION NEEDED**: Check if textual is compatible with existing rich version

### Integration Points

| Component | Integration | Status |
|-------------|-------------|--------|
| Existing CLI commands | Wrap with TUI | ✅ Planned (Task 5.2) |
| Kernel bootstrap | Initialize providers | ✅ Planned (Task 5.1) |
| Cost governor | Track provider costs | ⚠️ NOT EXPLICITLY COVERED |
| Memory system | Store TUI preferences | ⚠️ NOT EXPLICITLY COVERED |

**GAP IDENTIFIED**: Cost tracking integration with TUI not explicitly planned

---

## 3. ACCEPTANCE CRITERIA

### Functional Requirements

| ID | Criterion | Priority | Verification |
|----|-----------|----------|--------------|
| AC-1 | `hercules` launches TUI in interactive terminal | P0 | Manual test |
| AC-2 | `hercules "task"` executes without TUI | P0 | Manual test |
| AC-3 | All 4 providers configurable via setup wizard | P0 | Unit test |
| AC-4 | Provider switching works without restart | P1 | Unit test |
| AC-5 | File browser shows project tree | P1 | Visual verification |
| AC-6 | Chat panel displays streaming responses | P0 | Manual test |
| AC-7 | Command palette (Ctrl+Shift+P) works | P1 | Manual test |
| AC-8 | Diff viewer shows code changes | P1 | Visual verification |
| AC-9 | Status bar shows cost/progress | P1 | Visual verification |
| AC-10 | Keyboard navigation works throughout | P1 | Manual test |

### Non-Functional Requirements

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| NFR-1 | TUI startup time | < 2 seconds | Timer |
| NFR-2 | Provider switch latency | < 500ms | Timer |
| NFR-3 | Memory usage | < 200MB | htop |
| NFR-4 | Test coverage | > 80% | pytest |
| NFR-5 | Keyboard shortcut discoverability | 100% | Command palette |

---

## 4. RESPONSIBILITY MATRIX

### Task Ownership

| Phase | Task | Responsible | Skills Required | Estimated Time |
|-------|------|-------------|-----------------|----------------|
| 1.1 | TUI Entry Point | Executor | Textual, async | 30 min |
| 1.2 | Layout Components | Executor | Textual, widgets | 45 min |
| 1.3 | Main TUI App | Executor | Textual, screens | 25 min |
| 2.1 | Provider Base | Executor | Abstract classes | 20 min |
| 2.2 | OpenAI Provider | Executor | OpenAI SDK | 20 min |
| 2.3 | NVIDIA Provider | Executor | OpenAI-compatible | 20 min |
| 2.4 | OpenRouter Provider | Executor | HTTP/API | 20 min |
| 2.5 | Ollama Provider | Executor | REST API | 20 min |
| 3.1 | Setup Wizard | Executor | Textual forms | 30 min |
| 3.2 | Provider Selector | Executor | Textual widgets | 15 min |
| 4.1 | Streaming Output | Executor | Async iterators | 25 min |
| 4.2 | Diff Viewer | Executor | Rich diff | 20 min |
| 4.3 | Command Palette | Executor | Textual modal | 20 min |
| 5.1 | CLI Entry Update | Executor | sys.stdin.isatty | 15 min |
| 5.2 | Command Integration | Executor | Refactoring | 15 min |
| 5.3 | Config Manager | Executor | Encryption, env | 20 min |
| 6.1 | TUI Tests | Executor | pytest-textual | 25 min |
| 6.2 | Provider Tests | Executor | Mocking, async | 20 min |

**TOTAL**: 18 tasks, 7 hours

---

## 5. GAP ANALYSIS

### Critical Gaps (Must Fix Before Execution)

| ID | Gap | Impact | Mitigation |
|----|-----|--------|------------|
| GAP-1 | Cost tracking integration with TUI | Can't see real-time cost | Add cost display to status bar |
| GAP-2 | Memory system integration | Can't query from TUI | Add memory panel or command |
| GAP-3 | Error handling in TUI | Crashes on provider errors | Add error modal/dialog |
| GAP-4 | Session persistence | Lose TUI state on crash | Auto-save layout state |

### Recommended Enhancements (Nice to Have)

| ID | Enhancement | Value | Effort |
|----|-------------|-------|--------|
| ENH-1 | Custom themes | User preference | Low |
| ENH-2 | Vim keybindings | Power users | Medium |
| ENH-3 | Split screen resizing | Layout flexibility | Medium |
| ENH-4 | Search in file browser | Navigation | Low |
| ENH-5 | Recent files | Quick access | Low |

---

## 6. RISK ANALYSIS

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Textual learning curve | Medium | Delays | Assign Textual-experienced agent |
| Provider API changes | Low | Broken providers | Abstract base class with version handling |
| Performance with large repos | Medium | Slow UI | Virtual scrolling in file browser |
| Async complexity | Medium | Bugs | Comprehensive testing, type hints |

### External Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider downtime | Medium | Degraded UX | Show offline status, fallback |
| Rate limiting | High | Interrupted workflow | Retry logic with exponential backoff |
| API deprecation | Low | Non-functional | Monitor provider changelogs |

---

## 7. SUCCESS CRITERIA

### Definition of Done

```
✅ TUI launches with `hercules` command
✅ All 4 providers configurable via wizard
✅ File browser displays project tree
✅ Chat panel streams responses
✅ Command palette accessible via Ctrl+Shift+P
✅ Diff viewer shows code changes
✅ Status bar displays cost/progress
✅ Provider switching works without restart
✅ Tests pass (>80% coverage)
✅ Documentation complete
✅ No critical bugs
```

### Exit Criteria

- [ ] All 18 tasks complete
- [ ] AC-1 through AC-10 verified
- [ ] NFR-1 through NFR-5 met
- [ ] No critical or high bugs
- [ ] Code review approved
- [ ] Documentation updated

---

## 8. RECOMMENDATIONS

### Before Execution

1. **Add missing tasks** for cost/memory integration:
   - Task X: Add cost display to status bar
   - Task Y: Add memory query panel
   - Task Z: Add error handling dialogs

2. **Verify dependencies**:
   - Check textual version compatibility
   - Ensure openai SDK covers NVIDIA/OpenRouter

3. **Assign agent with Textual experience**:
   - UI components need framework familiarity
   - Consider pairing if agent is new to Textual

### During Execution

1. **Test early and often**:
   - Manual testing of TUI is critical
   - Use pytest-textual for automated UI tests

2. **Iterate on UX**:
   - Get feedback on keyboard shortcuts
   - Adjust layout based on usage

3. **Document as you go**:
   - Keyboard shortcuts reference
   - Troubleshooting guide

### After Execution

1. **User acceptance testing**:
   - Test with real workflows
   - Gather feedback on TUI experience

2. **Performance profiling**:
   - Check memory usage with large projects
   - Optimize file browser if needed

3. **Accessibility review**:
   - Keyboard-only navigation
   - Screen reader compatibility

---

## 9. REVISED PLAN SUMMARY

### Original: 18 tasks, 7 hours
### With Gaps Fixed: 21 tasks, 8 hours

**Added Tasks**:
- Task X: Cost tracking in TUI (15 min)
- Task Y: Memory integration (15 min)
- Task Z: Error handling (15 min)

### Execution Strategy

**Wave 1** (Foundation):
- 1.1 TUI Entry Point
- 2.1 Provider Base Classes
- X. Cost Integration (NEW)

**Wave 2** (UI Components):
- 1.2 Layout Components
- 1.3 Main TUI App
- Y. Memory Panel (NEW)

**Wave 3** (Providers):
- 2.2 OpenAI Provider
- 2.3 NVIDIA Provider
- 2.4 OpenRouter Provider
- 2.5 Ollama Provider

**Wave 4** (Enhanced Features):
- 4.1 Streaming Output
- 4.2 Diff Viewer
- 4.3 Command Palette
- Z. Error Handling (NEW)

**Wave 5** (Setup & Integration):
- 3.1 Setup Wizard
- 3.2 Provider Selector
- 5.1 CLI Entry Update
- 5.2 Command Integration
- 5.3 Config Manager

**Wave 6** (Testing):
- 6.1 TUI Tests
- 6.2 Provider Tests

---

## 10. FINAL DECISION

### Status: ✅ READY FOR EXECUTION (with gaps noted)

The plan is comprehensive and covers all stated requirements. However, **3 critical gaps were identified** that should be addressed either:

**Option A**: Add the 3 tasks before execution (recommended)
**Option B**: Execute as-is and handle gaps as follow-up
**Option C**: Prioritize - do core TUI first, enhancements later

**RECOMMENDATION**: Option A - Add the 3 gap tasks now to avoid technical debt.

---

## NEXT STEPS

1. **Review this document** with stakeholders
2. **Decide on gaps** (Option A/B/C)
3. **Update plan** with additional tasks if Option A
4. **Execute** via `/start-work`
5. **Monitor** progress against acceptance criteria

---

*Review completed by Prometheus*
*Date: 2026-04-17*
*Plan version: 1.1*
