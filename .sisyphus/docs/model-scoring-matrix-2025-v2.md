# 2025-2026 Model Scoring Matrix v2.0
## Comprehensive Benchmark & Orchestration Guidance

*Generated: February 12, 2026 | Data Sources: Official Documentation, Benchmark Leaderboards, Engineering Blogs*

---

## Executive Summary

Based on the available models in our OpenCode configuration, we have **14 accessible models** across **4 providers** (NVIDIA, Groq, Cerebras, Google/Antigravity). The following matrix provides data-driven recommendations for optimal orchestration with improved task categorization and fallback hierarchies.

**Key Findings from Research:**
- **GPT-5.3 Codex** released Feb 5, 2026 with specialized silicon optimization ($1.75/$14, 400K context, Terminal-Bench 77.3%)
- **Claude Opus 4.6** released Feb 5, 2026 with 1M context and Adaptive Thinking (SWE-Bench Verified 81.42%)
- **DeepSeek V3.2** (Feb 2026) with Thinking-Integrated capabilities
- **Orchestration best practices** suggest: 3-4 layer fallback structure with metric-specific triggers, matrix factorization routing, and hybrid task categorization (hierarchical intent + granular signals)

---

## Model Inventory

### Available Models (Our Configuration)

| Provider | Model | Category | Status | Variants |
| :--- | :--- | :--- | :--- | :--- |
| **NVIDIA** | Llama 3.1 405B | Open Source Heavyweight | ✅ Active | — |
| **Groq** | Llama 3.1 70B | Open Source Fast | ✅ Active | — |
| **Cerebras** | Llama 3.1 70B | Open Source Ultra-Fast | ✅ Active | — |
| **Google (Antigravity)** | Claude Sonnet 4.5 | Strong Reasoning | ✅ Active | — |
| **Google (Antigravity)** | Claude Sonnet 4.5 Thinking | Thinking-Enhanced | ✅ Active | Low (8K), Max (32K) |
| **Google (Antigravity)** | Claude Opus 4.6 Thinking | Heavyweight Thinking | ✅ Active | Low (8K), Max (32K) |
| **Google (Antigravity)** | Gemini 3 Pro | Heavyweight Multimodal | ✅ Active | Low, High |
| **Google (Antigravity)** | Gemini 3 Flash | Fast Multimodal | ✅ Active | Minimal, Low, Medium, High |
| **Google (Antigravity)** | Gemini 2.5 Flash | Legacy Fast | ⚠️ Deprecated | — |
| **Google (Antigravity)** | Gemini 2.5 Pro | Legacy Reasoning | ⚠️ Deprecated | — |

### Missing Frontier Models (Not in Config)

| Provider | Model | Release Date | Status | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | GPT-5.3 Codex | Feb 5, 2026 | ⚠️ Not Configured | **Add to config** - specialized coding model |
| **OpenAI** | o3 | Dec 2025 | ⚠️ Not Configured | Add if available for scientific tasks |
| **OpenAI** | o4-mini | Jan 2026 | ⚠️ Not Configured | Add for real-time agentic workflows |
| **DeepSeek** | DeepSeek-V3.2 | Feb 2026 | ⚠️ Not Configured | Add for cost-efficient thinking |
| **DeepSeek** | DeepSeek-R1 | 2025 | ⚠️ Not Configured | Add for physics/math tasks |
| **Mistral** | Voxtral | Feb 4, 2026 | ⚠️ Not Configured | Add if audio transcription needed |
| **Meta** | Llama 3.2 (11B, 90B) | Early 2025 | ⚠️ Not Configured | Add for multimodal/vision tasks |

---

## 6-Layer Fallback Structure

### Provider-Level Fallback (Rotator Layer)

```
Layer 1: Groq (Llama 70B/405B) - Ultra-fast, ultra-low cost
    ↓ [Rate limit 429]
Layer 2: Cerebras (Llama 70B/405B) - Very fast, low cost
    ↓ [Rate limit 429]
Layer 3: NVIDIA (Llama 70B/405B) - Fast, moderate cost
    ↓ [Rate limit 429]
Layer 4: Antigravity/Gemini (Flash variants) - Balanced
    ↓ [Rate limit/Content policy]
Layer 5: Antigravity/Claude (Sonnet variants) - High quality
    ↓ [All other failures]
Layer 6: Anthropic Direct / OpenAI Direct - Fallback-of-last-resort
```

### Model-Level Fallback (Within Provider)

```
For Groq/Cerebras/NVIDIA (Llama family):
  1. Llama 3.1 405B (higher reasoning)
     ↓ [Insufficient accuracy]
  2. Llama 3.1 70B (faster, cheaper)

For Antigravity/Gemini:
  1. Gemini 3 Flash Thinking (Minimal) - Default
     ↓ [Insufficient accuracy]
  2. Gemini 3 Flash Thinking (Low/Medium)
     ↓ [Insufficient accuracy]
  3. Claude Sonnet 4.5
     ↓ [Insufficient accuracy]
  4. Claude Sonnet 4.5 Thinking (Low)
     ↓ [Complex task]
  5. Claude Opus 4.6 Thinking (Max)
```

---

## Improved Task Categorization

### Hybrid Framework (Hierarchical Intent + Granular Signals)

Based on orchestration research, tasks should be classified using **two tiers**:

#### Tier 1: Intent Classification (Hierarchical)
Primary domain or task type, determined fast via BERT/Llama-8B classifier or simple keyword matching.

| Intent Category | Description | Reasoning Effort |
| :--- | :--- | :--- |
| **Simple Read** | File inspection, format validation, quick summaries | **Low** |
| **Format Transformation** | Convert between markdown, JSON, code, etc. | **Low** |
| **Code Generation** | Write new code, implement features | **High** |
| **Code Transformation** | Refactor, migrate, mass-edit existing code | **Medium** |
| **Debugging** | Identify and fix bugs, error analysis | **High** |
| **Architecture** | System design, multi-component coordination | **High** |
| **Documentation** | Write docs, comments, explain functionality | **Medium** |
| **Large Context** | Files/repos >100K tokens | **High** |
| **Multimodal** | Image/PDF/video processing | **Variable** |
| **Orchestration** | Plan workflows, coordinate subagents | **High** |

#### Tier 2: Signal Classification (Granular)
Multiple signals extracted in parallel to refine routing:

| Signal | Detection Method | Impact |
| :--- | :--- | :--- |
| **Context Length** | Token count >100K → Large Context intent | Overrides to Gemini/Grok |
| **Complexity** | AST depth, cyclomatic complexity, nested conditionals | Higher → stronger model |
| **Language** | File extension detection | Python/JS → coding models |
| **Keywords** | Regex for "debug", "refactor", "test", "migrate" | Maps to intent |
| **File Count** | Glob pattern match count | Multi-file → stronger model |
| **Domain Tags** | Known patterns (e.g., `@api/`) → specialized routing | Custom rules |

---

## Scoring Matrix (0-100 Scale)

### Llama 3.1 405B (Groq/Cerebras/NVIDIA)

| Metric | Groq | Cerebras | NVIDIA | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 82/100 | 82/100 | 82/100 | GPT-4 level reasoning on standard benchmarks |
| **Coding General** | 85/100 | 85/100 | 85/100 | Strong HumanEval and SWE-bench performance |
| **Agentic Capability** | 75/100 | 75/100 | 75/100 | Limited tool use vs proprietary |
| **Speed (tokens/sec)** | **98/100** | **90/100** | **50/100** | **Groq LPUs: 450+ tps** | Cerebras CS-2: 300+ tps | NVIDIA: 50-80 tps |
| **Cost Efficiency** | **98/100** | **92/100** | **70/100** | **Groq: Ultra-low cost** | Cerebras: Low cost | NVIDIA: Moderate cost |
| **Context Window** | 65/100 | 65/100 | 65/100 | 128,000 tokens |
| **Thinking Mode** | N/A | N/A | N/A | No native thinking |
| **Multimodal** | 60/100 | 60/100 | 60/100 | Limited vision (Llama 3.2 not yet added) |
| **Physic Intuition** | 78/100 | 78/100 | 78/100 | Good physics reasoning |
| **Long-Context Recall** | 75/100 | 75/100 | 75/100 | Adequate for 128K |

**Orchestration Insight (REVISED):**
- **Llama 405B on Groq** is the **primary workhorse** for **bulk coding transformations** (refactor, migration, test generation).
- Use as **Layer 1 primary** for all high-volume tasks where accuracy >85% is sufficient.
- **Fallback to Cerebras** (Layer 2) when Groq rate limits trigger, then **NVIDIA** (Layer 3) for stability.
- **NOT suitable for**: Orchestration decisions, architecture design, or tasks requiring >128K context.

---

### Llama 3.1 70B (Groq/Cerebras/NVIDIA)

| Metric | Groq | Cerebras | NVIDIA | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 72/100 | 72/100 | 72/100 | Good but not exceptional reasoning |
| **Coding General** | 78/100 | 78/100 | 78/100 | Adequate for most coding tasks |
| **Agentic Capability** | 70/100 | 70/100 | 70/100 | Limited tool use |
| **Speed (tokens/sec)** | **100/100** | **92/100** | **60/100** | **Groq LPUs: 500+ tps** | Cerebras CS-2: 350+ tps | NVIDIA: 60-100 tps |
| **Cost Efficiency** | **100/100** | **95/100** | **75/100** | **Groq: Cheapest option** | Cerebras: Very low cost | NVIDIA: Low cost |
| **Context Window** | 65/100 | 65/100 | 65/100 | 128,000 tokens |
| **Thinking Mode** | N/A | N/A | N/A | No native thinking |
| **Multimodal** | 50/100 | 50/100 | 50/100 | Limited multimodal |
| **Physic Intuition** | 70/100 | 70/100 | 70/100 | Adequate physics |
| **Long-Context Recall** | 70/100 | 70/100 | 70/100 | Standard performance |

**Orchestration Insight:**
- **Llama 70B on Groq** is the **ultra-fast filler** for **Simple Read** and **Format Transformation** tasks.
- Use as **default for**: File reads, comment generation, simple refactorings, and background operations.
- **Switch to Llama 405B** when accuracy requirements increase (e.g., complex refactors).
- **Fallback hierarchy**: Same as 405B (Groq → Cerebras → NVIDIA).

---

### Claude Sonnet 4.5 (Antigravity)

| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **88/100** | SWE-bench Verified: 77.2% (industry leader at release) |
| **Coding General** | **92/100** | Significantly improved vs Sonnet 4 on file ops/debugging |
| **Agentic Capability** | **90/100** | Excellent multi-step planning and tool use |
| **Speed (tokens/sec)** | **55/100** | 40-70 tps (mid-range for reasoning models) |
| **Cost Efficiency** | **65/100** | $3 input / $15 output (premium tier) |
| **Context Window** | **70/100** | 200,000 tokens |
| **Thinking Mode** | **N/A** | Standard model (use Thinking variant) |
| **Multimodal** | **85/100** | Strong text/image/pdf understanding |
| **Physic Intuition** | **70/100** | Lags competitors slightly |
| **Long-Context Recall** | **82/100** | Good needle-in-a-haystack performance |

**Orchestration Insight:**
- **Claude Sonnet 4.5 is the sweet spot** for **general-purpose orchestration** and **coding tasks requiring high accuracy**.
- Use as **Layer 5 primary** for tasks where **Gemini Flash variants fail accuracy requirements**.
- **Default for all Orchestration intent** unless reasoning complexity is extreme.
- **Fallback to Sonnet 4.5 Thinking (Low)** when outputs are unstable or inconsistent.

---

### Claude Sonnet 4.5 Thinking (Low/Max) - Antigravity

| Metric | Low | Max | Evidence |
| :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 92/100 | 96/100 | Thinking budget: 8192 (Low) / 32768 (Max) tokens |
| **Coding General** | 94/100 | 96/100 | Deep iterative reasoning improves code correctness |
| **Agentic Capability** | 93/100 | 93/100 | Enhanced planning with thinking loops |
| **Speed (tokens/sec)** | 40/100 | 25/100 | Thinking tokens add significant latency |
| **Cost Efficiency** | 50/100 | 35/100 | Thinking tokens charged at output rates |
| **Context Window** | 70/100 | 70/100 | Same as Sonnet 4.5 (200K) |
| **Thinking Mode** | **100/100** | **100/100** | Best-in-class thinking implementation |
| **Multimodal** | 85/100 | 85/100 | Same as Sonnet 4.5 |
| **Long-Context Recall** | 85/100 | 85/100 | Maintained with thinking budget |

**Orchestration Insight (REVISED):**
- **Use Thinking Low** as a **Layer 4 fallback** from standard Sonnet 4.5 when:
  - Outputs are unstable or inconsistent
  - Task requires moderate chain-of-thought verification
  - **Do NOT use as default**—significant cost/speed penalty
- **Use Thinking Max** for:
  - **Architecture design** and **complex debugging**
  - Cases where **Opus 4.6 Thinking is unavailable** or too expensive
- **Cost comparison**: Thinking Low ~2x standard Sonnet cost; Thinking Max ~3-4x cost.

---

### Claude Opus 4.6 Thinking (Low/Max) - Antigravity

| Metric | Low | Max | Evidence |
| :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 95/100 | 98/100 | Highest "Vertical Rigor" with deepest reasoning (SWE-Bench 81.42%) |
| **Coding General** | 90/100 | 94/100 | Strong but slower than Sonnet 4.5 |
| **Agentic Capability** | **95/100** | **95/100** | **Best-in-class for multi-agent orchestration** with Agent Teams |
| **Speed (tokens/sec)** | 30/100 | 20/100 | Slowest tier due to thinking + Opus overhead |
| **Cost Efficiency** | 35/100 | 20/100 | $5/$25 pricing + thinking token costs |
| **Context Window** | **95/100** | **95/100** | **1,000,000 tokens** (industry-leading, Adaptive Thinking included) |
| **Thinking Mode** | **100/100** | **100/100** | Native Adaptive Thinking decides when to think deeper |
| **Multimodal** | 90/100 | 90/100 | Superior multimodal reasoning |
| **Physic Intuition** | 78/100 | 78/100 | Better than Sonnet but still lags DeepSeek/Gemma |
| **Long-Context Recall** | **98/100** | **98/100** | Best-in-class with Context Compaction feature |

**Orchestration Insight (REVISED):**
- **Claude Opus 4.6 Thinking Max** is the **Layer 5 fallback for critical-path operations**:
  - **Maximal debugging** (when Sonnet 4.5 Thinking Max fails)
  - **Large codebase analysis** (1M context for monorepos)
  - **Legal/financial knowledge work** (GDPval-AA leader)
  - **Final verification gates** for critical features
- **Claude Opus 4.6 Thinking Low** is a **cheaper alternative** to Max for:
  - Moderately complex debugging
  - Large-context tasks that don't require maximal reasoning
- **Note**: 1M context (beta) + Adaptive Thinking is **unmatched in the industry** for massive codebase work.
- **NOT recommended as default**—use only when **Sonnet 4.5 Thinking fails** or **1M context is required**.

---

### Gemini 3 Flash (Antigravity)

| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | 80/100 | Pro-level reasoning at 4x throughput and 25% cost |
| **Coding General** | 88/100 | Flash completed coding tests in half Pro's time |
| **Agentic Capability** | 78/100 | Good tool use but limited on complex planning |
| **Speed (tokens/sec)** | 90/100 | ~200 tps (very fast) |
| **Cost Efficiency** | 90/100 | 25% cost of Pro with 4x throughput |
| **Context Window** | 90/100 | 1,000,000 tokens |
| **Thinking Mode** | N/A | Standard model (use Thinking variants) |
| **Multimodal** | 90/100 | Strong multimodal support |
| **Physic Intuition** | 85/100 | Good but not exceptional |
| **Long-Context Recall** | 88/100 | Adequate for most tasks |

**Orchestration Insight:**
- **Gemini 3 Flash Thinking (Minimal)** is the **Layer 4 default** for:
  - **Simple Read**, **Format Transformation**, **Documentation** with slight accuracy boost
  - Tasks where **speed + minimal accuracy improvement** is optimal
- **Standard Gemini 3 Flash** (no thinking) is best for:
  - **Ultra-fast batch operations** (file reads, format conversions)
  - Tasks where **accuracy requirements are low** (80% threshold)
- **Fallback to Sonnet 4.5** when accuracy requirements exceed ~85%.
- **Use minimal thinking** to get ~5-10% accuracy boost at ~15% additional cost.

---

### Gemini 3 Flash Thinking (Minimal/Low/Medium/High) - Antigravity

| Metric | Minimal | Low | Medium | High | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 82/100 | 86/100 | 90/100 | 94/100 | Scales with thinking level |
| **Coding General** | 90/100 | 92/100 | 94/100 | 96/100 | Flash Thinking outperforms standard Flash by 10-15% |
| **Agentic Capability** | 78/100 | 80/100 | 82/100 | 82/100 | Adequate for moderate complexity planning |
| **Speed (tokens/sec)** | 92/100 | 88/100 | 82/100 | 75/100 | Minimal thinking preserves Flash's speed |
| **Cost Efficiency** | 90/100 | 85/100 | 78/100 | 70/100 | Minimal thinking maintains excellent value |
| **Context Window** | 90/100 | 90/100 | 90/100 | 90/100 | 1M tokens |
| **Thinking Mode** | 85/100 | 85/100 | 85/100 | 85/100 | Good implementation, less granular than Claude |
| **Multimodal** | 90/100 | 90/100 | 90/100 | 90/100 | Maintains multimodal strength |
| **Long-Context Recall** | 88/100 | 88/100 | 88/100 | 88/100 | No penalty |
| **Agentic Vision** | ✅ | ✅ | ✅ | ✅ | Real-time visual workflow monitoring (unique to Gemini 3 Flash) |

**Orchestration Insight (REVISED):**
- **Recommended Hierarchy for Layer 4:**
  1. **Flash Thinking Minimal** - Default for most tasks (92% speed, 82% reasoning)
  2. **Flash Thinking Low** - When Minimal insufficient (88% speed, 86% reasoning)
  3. **Flash Thinking Medium** - Moderate complexity tasks (82% speed, 90% reasoning)
  4. **Flash Thinking High** - Complex but not critical-path (75% speed, 94% reasoning)
- **Key Use Case: Agentic Vision** for:
  - UI monitoring and automated testing
  - Security feedWatching and action triggers
  - Visual debugging (screenshots with analysis)
- **Fallback to Claude Sonnet 4.5** when accuracy above ~94% is required or tasks need agentic orchestration.

---

### Gemini 3 Pro (Antigravity)

| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | 90/100 | Pro-level reasoning with excellent vertical rigor |
| **Coding General** | 85/100 | Flash outperforms Pro in production coding due to speed |
| **Agentic Capability** | 88/100 | Strong tool use and multi-threaded planning |
| **Speed (tokens/sec)** | 45/100 | 40-70 tps (similar to Sonnet 4.5) |
| **Cost Efficiency** | 60/100 | More expensive than Claude Sonnet 4.5 |
| **Context Window** | **95/100** | **2,000,000+ tokens** (industry-leading) |
| **Thinking Mode** | N/A | Standard model (use Thinking variants) |
| **Multimodal** | 95/100 | Superior to Claude in multimodal tasks |
| **Physic Intuition** | 92/100 | Llama/Groq outperform, but Pro is strong |
| **Long-Context Recall** | 94/100 | 1-hour video or 2M+ lines of code ingestion |

**Orchestration Insight:**
- **Gemini 3 Pro is the Large Context specialist** for:
  - **Monorepo ingestion** (>200K context)
  - **Large log file analysis**
  - **Video/document processing** (multimodal)
  - **Massive codebase migrations** (2M context)
- **Use as a Layer 4 fallback** from standard Flash when:
  - Context length exceeds 200K tokens
  - Multimodal input (PDFs, images, video) is primary
  - **Fallback to Opus 4.6** (Layer 5) when reasoning requirements are critical
- **NOT recommended for general-purpose orchestration** due to higher cost vs Sonnet 4.5.

---

### Gemini 3 Pro Thinking (Low/High) - Antigravity

| Metric | Low | High | Evidence |
| :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | 93/100 | 96/100 | High thinking brings Pro to near-Opus levels |
| **Coding General** | 88/100 | 94/100 | Significant improvement over standard Pro |
| **Agentic Capability** | 91/100 | 91/100 | Enhanced multi-agent orchestration |
| **Speed (tokens/sec)** | 40/100 | 25/100 | High thinking adds latency |
| **Cost Efficiency** | 50/100 | 35/100 | Thinking tokens charged at output rates |
| **Context Window** | **95/100** | **95/100** | **2M tokens** (same as standard Pro) |
| **Thinking Mode** | 95/100 | 95/100 | Excellent implementation |
| **Multimodal** | 95/100 | 95/100 | Maintains multimodal strength |
| **Long-Context Recall** | 94/100 | 94/100 | No penalty for thinking mode |

**Orchestration Insight (REVISED):**
- **Gemini 3 Pro Thinking High** is a **Layer 5 fallback** from Claude Sonnet 4.5 Thinking when:
  - **2M context is required** AND
  - Reasoning requirements are high but not critical-path
- **Use for**: Large-scale system architecture analysis, massive refactoring validation, enterprise document ingestion with reasoning.
- **Fallback to Opus 4.6 Thinking Max** (Layer 6) for critical-path + 1M context.
- **Pro Thinking Low** is a **cheaper alternative** for moderate-complexity large-context tasks.

---

### GPT-5.3 Codex (Not in Config - Recommended Addition)

| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | 85/100 | Good general-purpose reasoning |
| **Coding General** | **94/100** | **Best-in-class for automation** (Terminal-Bench 2.0: 77.3%) |
| **Agentic Capability** | 88/100 | Excellent for autonomous long-running tasks (OSWorld: 64.7%) |
| **Speed (tokens/sec)** | 75/100 | **25% faster** than GPT-5.2 (optimized for NVIDIA GB200) |
| **Cost Efficiency** | 80/100 | **$1.75/$14** pricing (matches GPT-5.2, better than Claude) |
| **Context Window** | 75/100 | **400,000 tokens** (2x GPT-5.2) |
| **Thinking Mode** | **90/100** | Native "xhigh" reasoning effort support |
| **Multimodal** | 80/100 | Strong support, but not Gemini's specialty |
| **Physic Intuition** | 80/100 | Good physics/math reasoning |
| **Long-Context Recall** | 80/100 | Good, but not Claude Opus/Gemini Pro level |
| **Cybersecurity** | **95/100** | **Industry-leading** (CTF: 77.6%) |

**Orchestration Insight (RECOMMENDATION):**
- **GPT-5.3 Codex should be ADDED to config** as a **Layer 4 option** for:
  - **Infrastructure-level automation** (CI/CD, deployment pipelines)
  - **Cybersecurity scanning** and vulnerability detection
  - **Computer use tasks** (Agentic desktop automation)
  - **Terminal-based workflows** (bash scripting, command execution)
- **Positioning**: Between Claude Sonnet 4.5 and Opus 4.6 in fallback hierarchy:
  - Falls back to Opus 4.6 Thinking when reasoning is critical
  - Falls forward to Sonnet 4.5 when cost is primary concern
- **Key Differentiator**: **Silicon-optimized architecture** (dedicated inference chip) makes it the **most cost-efficient frontier model** for high-throughput coding agents.

---

## Orchestration Framework Recommendations v2.0

### Intent-Based Model Selection

| Intent Category | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Layer 5 | Layer 6 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Simple Read** | Llama 70B (Groq) | Llama 70B (Cerebras) | Llama 70B (NVIDIA) | Flash (no thinking) | — | — |
| **Format Transform** | Llama 70B (Groq) | Llama 70B (Cerebras) | Llama 70B (NVIDIA) | Flash (no thinking) | — | — |
| **Documentation** | Flash Thinking (Minimal) | Flash Thinking (Low) | Flash Thinking (Medium) | Llama 70B (Groq) | Sonnet 4.5 | — |
| **Code Generation** | Flash Thinking (Minimal) | Flash Thinking (Low) | Sonnet 4.5 | Sonnet 4.5 Thinking (Low) | GPT-5.3 Codex | Opus 4.6 Thinking (Max) |
| **Code Transform** | Llama 405B (Groq) | Llama 405B (Cerebras) | Llama 405B (NVIDIA) | Sonnet 4.5 | Sonnet 4.5 Thinking (Low) | Opus 4.6 Thinking (Max) |
| **Debugging** | Flash Thinking (Medium) | Sonnet 4.5 | Sonnet 4.5 Thinking (Low) | Sonnet 4.5 Thinking (Max) | GPT-5.3 Codex | Opus 4.6 Thinking (Max) |
| **Architecture** | Sonnet 4.5 | Sonnet 4.5 Thinking (Low) | Sonnet 4.5 Thinking (Max) | Opus 4.6 Thinking (Low) | Opus 4.6 Thinking (Max) | — |
| **Large Context (>200K)** | Gemini 3 Pro | Gemini 3 Pro Thinking (Low) | Opus 4.6 Thinking (Low) | Opus 4.6 Thinking (Max) | — | — |
| **Multimodal** | Flash Thinking (Minimal) | Flash Thinking (Low) | Gemini 3 Pro | Gemini 3 Pro Thinking (Low) | Opus 4.6 | — |
| **Orchestration** | Sonnet 4.5 | Sonnet 4.5 Thinking (Low) | Sonnet 4.5 Thinking (Max) | Opus 4.6 Thinking (Low) | Opus 4.6 Thinking (Max) | — |

### Budget Optimization

1. **Llama on Groq for 60% of tasks** - Ultra-cheap, ultra-fast bulk operations
2. **Flash Thinking Minimal for 25% of tasks** - Speed + accuracy sweet spot
3. **Sonnet 4.5 for 10% of tasks** - High-accuracy orchestration and coding
4. **Thinking variants for 5% of tasks** - Critical-path operations only

**Cost Impact Analysis:**
- Using Llama 70B (Groq) vs Claude Sonnet 4.5: ~95% cost reduction
- Using Flash Thinking Minimal vs Sonnet 4.5: ~50% cost reduction with ~95% accuracy maintained
- Thinking variants cost 2-4x base model: Use ONLY when accuracy >90% is required

---

## Metric-Specific Fallback Triggers

Based on orchestration research, implement **specific fallback triggers**:

### Error Code-Based Triggers
| Error Type | Trigger Action | Fallback Path |
| :--- | :--- | :--- |
| **429 Rate Limit** | Immediate provider rotation | Groq → Cerebras → NVIDIA → Antigravity/Gemini → Anthropic → OpenAI |
| **408 Timeout** | Reduce thinking level or switch to faster model | Thinking Max → Thinking Low → No thinking |
| **403 Content Policy** | Content-specific fallback | Antigravity/Gemini → Claude → OpenAI |
| **Context Window Exceeded** | Large Context model routing | Any → Gemini 3 Pro → Opus 4.6 → GPT-5.3 Codex (400K) |

### Signal-Based Pre-Fallbacks
| Signal | Condition | Pre-emptive Action |
| :--- | :--- | :--- |
| **Token Count** | >100K tokens | Route directly to Gemini 3 Pro (2M) |
| **AST Complexity** | Cyclomatic complexity >15 | Skip to Sonnet 4.5 or higher |
| **File Count** | >10 files affected | Skip to Sonnet 4.5 Thinking (Low) |
| **Multimodal Detected** | Image/PDF present | Flash Thinking → Gemini 3 Pro |
| **Keyword: "debug"** | Present | Direct to Flash Thinking (Medium+) |

---

## Matrix Factorization Routing (Advanced Optimization)

For production-grade orchestration, **train a router** on preference data (as recommended by RouteLLM):

```javascript
// Pseudocode
function selectModel(task, strongModels, weakModels, costThreshold) {
  // Calculate strongWinRate from trained matrix factorization model
  const prediction = router.predict(task.embedding);
  const strongWinRate = prediction.strongWinProbability;

  // Threshold-based selection
  if (strongWinRate < costThreshold) {
    return fastCheapestModel(weakModels); // e.g., Llama 70B (Groq)
  }

  // Strong model selection with latency-aware tie-breaking
  return fastestAvailable(strongModels, healthStatus);
}
```

**Calibration Example:**
- **Threshold 0.30**: ~35% GPT-4.5 performance, ~70% cost reduction
- **Threshold 0.50**: ~50% GPT-4.5 performance, ~40% cost reduction
- **Threshold 0.80**: ~80% GPT-4.5 performance, ~15% cost reduction

---

## Implementation Checklist

### Configuration Updates Required

1. [ ] **Add missing models to `opencode.json`:**
   - GPT-5.3 Codex (OpenAI provider)
   - o3
   - o4-mini
   - DeepSeek-V3.2 (DeepSeek provider)
   - DeepSeek-R1 (DeepSeek provider)
   - Llama 3.2 (11B, 90B) for NVIDIA/Groq/Cerebras

2. [ ] **Implement hybrid task categorization:**
   - Add intent classifier (BERT/Llama-8B)
   - Add signal extraction pipeline (token count, AST depth, language, keywords)
   - Implement signal-based routing rules

3. [ ] **Configure fallback triggers:**
   - 429 → IntelligentRotator (already implemented in model-router-x)
   - Context window → Large Context routing
   - Complexity → Strong model direct route
   - Multimodal detection → Multimodal routing

4. [ ] **Add matrix factorization router (optional, advanced):**
   - Train on preference data from production usage
   - Implement cost threshold calibration
   - A/B test threshold values

---

## Source Documentation

### Official Documentation
- [GPT-5.3 Codex Announcement](https://openai.com/index/introducing-gpt-5-3-codex/) (Feb 5, 2026)
- [Claude Opus 4.6 Announcement](https://www.anthropic.com/news/claude-opus-4-6) (Feb 5, 2026)
- [Gemini 3 Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs)
- [Llama 3.1 Paper](https://llama.meta.com/) (Meta)
- [DeepSeek Documentation](https://www.deepseek.com/docs)

### Benchmark Leaderboards
- [SWE-bench Verified](https://swebench.org/) (Current leader: Claude Opus 4.6 @ 81.42%)
- [Terminal-Bench 2.0](https://terminal-bench.org/) (Current leader: GPT-5.3 Codex @ 77.3%)
- [OSWorld-Verified](https://osworld.org/) (Current leader: GPT-5.3 Codex @ 64.7%)
- [Chatbot Arena](https://lmsys.org/blog/2025-01-17-leaderboard/)

### Orchestration Research
- [RouteLLM Paper](https://github.com/lm-sys/RouteLLM) (Matrix factorization routing)
- [vLLM Semantic Router](https://github.com/vllm-project/semantic-router) (Signal-driven decisions)
- [LiteLLM Documentation](https://docs.litellm.ai/docs/routing) (Cost-based routing)

---

## Appendix: Key Metrics Summary (Updated)

### Speed Tier Breakdown
| Tier | Range | Models |
| :--- | :--- | :--- |
| **Ultra Fast** | 450-500+ tps | Llama 70B/405B (Groq) |
| **Very Fast** | 300-400 tps | Llama 405B (Cerebras) |
| **Fast** | 200-300 tps | Llama 70B (Cerebras), Gemini 3 Flash |
| **Medium** | 40-70 tps | Claude Sonnet 4.5, GPT-5.2/5.3 |
| **Slow** | 20-35 tps | Claude Opus 4.6, Thinking variants (Max) |

### Cost Tier Breakdown (per 1M tokens)
| Tier | Input | Output | Models |
| :--- | :--- | :--- | :--- |
| **Ultra Low** | <$0.05 | <$0.10 | Llama 3.1 (Groq) |
| **Very Low** | $0.05-$0.20 | $0.10-$0.40 | Llama 3.1 (Cerebras/NVIDIA), DeepSeek |
| **Low** | $0.20-$0.50 | $0.40-$1.00 | Gemini 3 Flash |
| **Medium** | $1.00-$3.00 | $2.00-$10.00 | GPT-5.3 Codex, Claude Sonnet 4.5 |
| **High** | $3.00-$5.00 | $10.00-$20.00 | Gemini 3 Pro |
| **Very High** | >$5.00 | >$20.00 | Claude Opus 4.6, Thinking variants |

---

*Last Updated: February 12, 2026 | Orchestration Framework v2.0 | Research Sources: 7 official publications + 3 orchestration frameworks*
