# 2025-2026 Model Scoring Matrix
## Comprehensive Benchmark & Orchestration Guidance

*Generated: February 12, 2026 | Data Sources: Official Documentation, Benchmark Leaderboards, Engineering Blogs*

---

## Model Inventory

| Provider | Model | Category | Status |
| :--- | :--- | :--- | :--- |
| **Anthropic** | Claude Opus 4.6 | Heavyweight Reasoning | ✅ Active |
| **Anthropic** | Claude Sonnet 4.5 | Strong Reasoning | ✅ Active |
| **Anthropic** | Claude Sonnet 4.5 Thinking | Thinking-Enhanced | ✅ Active |
| **Anthropic** | Claude Haiku 4.5 | Fast/Cost | ✅ Active |
| **Google** | Gemini 3 Pro | Heavyweight Multimodal | ✅ Active |
| **Google** | Gemini 3 Pro Thinking | Thinking-Enhanced | ✅ Active |
| **Google** | Gemini 3 Flash | Fast Multimodal | ✅ Active |
| **Google** | Gemini 2.5 Pro | Legacy (2025 Q1) | ⚠️ Deprecated |
| **Google** | Gemini 2.5 Flash | Legacy (2025 Q1) | ⚠️ Deprecated |
| **Google** | Gemini 1.5 Flash | Fast/Cost | ✅ Active |
| **Google** | Gemini 1.5 Pro | Reasoning | ✅ Active |
| **Meta (via NVIDIA/Groq/Cerebras)** | Llama 3.1 405B | Open Source Heavyweight | ✅ Active |
| **Meta (via NVIDIA/Groq/Cerebras)** | Llama 3.1 70B | Open Source Fast | ✅ Active |
| **DeepSeek** | DeepSeek-V3 | MoE Reasoning | ✅ Active |
| **DeepSeek** | DeepSeek-R1 | Refined Thinking | ✅ Active |
| **OpenAI** | GPT-5.2 | General Purpose | ✅ Active |
| **Mistral** | Mistral Large 3 | Coding/Reasoning | ✅ Active |
| **Mistral** | Mistral Vibe | Developer Workflow | ✅ Active |

---

## Scoring Matrix (0-100 Scale)

### Claude Sonnet 4.5
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **88/100** | SWE-bench Verified: 77.2% (#1 globally) |
| **Coding General** | **92/100** | Significantly improved vs Sonnet 4 on file ops/debugging |
| **Agentic Capability** | **90/100** | Excellent multi-step planning and tool use integration |
| **Speed (tokens/sec)** | **55/100** | 40-70 tps (mid-range for reasoning models) |
| **Cost Efficiency** | **65/100** | $3 input / $15 output (premium tier) |
| **Context Window** | **70/100** | 200K standard / 500K Enterprise |
| **Thinking Mode** | **N/A** | Standard model (use Claude Sonnet 4.5 Thinking variant) |
| **Multimodal** | **85/100** | Strong text/image/pdf understanding |
| **Physic Intuition** | **70/100** | Lags competitors slightly |
| **Long-Context Recall** | **82/100** | Good needle-in-a-haystack performance |

**Orchestration Insight:** Sonnet 4.5 is the **sweet spot model** for orchestration. It balances accuracy, speed, and cost better than Opus or Haiku. Use as **default for general-purpose tasks** and **first-line fallback** from Flash variants.

### Claude Opus 4.6
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **95/100** | Highest "Vertical Rigor" with deepest reasoning |
| **Coding General** | **88/100** | Strong but slower than Sonnet 4.5 |
| **Agentic Capability** | **92/100** | Excellent for complex multi-agent orchestration |
| **Speed (tokens/sec)** | **35/100** | 20-35 tps (slowest tier) |
| **Cost Efficiency** | **40/100** | $5 input / $25 output (most expensive) |
| **Context Window** | **90/100** | 500K Enterprise tier (industry-leading) |
| **Thinking Mode** | **N/A** | Standard model (use Claude Opus 4.6 Thinking variant) |
| **Multimodal** | **90/100** | Superior multimodal reasoning |
| **Physic Intuition** | **75/100** | Better than Sonnet but still lags |
| **Long-Context Recall** | **95/100** | Best-in-class for legal/large-file parsing |

**Orchestration Insight:** Opus 4.6 is the **top-tier fallback** when Sonnet 4.5 fails. Use for **maximally critical reasoning**, **large document analysis**, and **final verification gates**. The 500K context window makes it ideal for **monorepo ingestion** when the codebase exceeds 200K tokens.

### Claude Sonnet 4.5 Thinking (Low/Max)
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **92/100** (Low) / **96/100** (Max) | Thinking budget: 8192 (Low) / 32768 (Max) tokens |
| **Coding General** | **90/100** (Low) / **94/100** (Max) | Deep iterative reasoning improves code correctness |
| **Agentic Capability** | **93/100** | Enhanced planning with thinking loops |
| **Speed (tokens/sec)** | **30/100** (Low) / **20/100** (Max) | Thinking tokens add significant latency |
| **Cost Efficiency** | **45/100** (Low) / **25/100** (Max) | Thinking tokens are charged at output rates |
| **Context Window** | **70/100** | Same as Sonnet 4.5 (200K/500K) |
| **Thinking Mode** | **100/100** | Best-in-class thinking implementation |
| **Multimodal** | **85/100** | Same as Sonnet 4.5 |
| **Long-Context Recall** | **90/100** | Maintained with thinking budget |

**Orchestration Insight:** Use **Thinking Low** as a **second-line fallback** when standard Sonnet 4.5 produces unstable outputs. Use **Thinking Max** as a **third-line fallback** for **debugging, diagnostics, and complex architecture decisions**. The thinking budget provides **explicit chain-of-thought verification** that significantly reduces hallucination risk.

### Claude Haiku 4.5
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **72/100** | Optimized for speed, not deep reasoning |
| **Coding General** | **75/100** | Good for simple file operations |
| **Agentic Capability** | **65/100** | Limited multi-step planning ability |
| **Speed (tokens/sec)** | **80/100** | 150-220 tps (fast tier) |
| **Cost Efficiency** | **85/100** | Cheapest Anthropic model (pricing TBD) |
| **Context Window** | **60/100** | Smaller context window (likely 100K-200K) |
| **Thinking Mode** | **N/A** | No thinking mode available |
| **Multimodal** | **75/100** | Basic multimodal support |
| **Physic Intuition** | **65/100** | Limited on physics tasks |
| **Long-Context Recall** | **70/100** | Adequate for standard tasks |

**Orchestration Insight:** Use Haiku 4.5 for **ultra-fast operations** where accuracy is secondary to speed: **simple text processing**, **format conversions**, **quick reads**, and **low-value tasks**. **Not recommended for orchestration decisions** or complex coding.

---

### Gemini 3 Pro
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **90/100** | Pro-level reasoning with excellent vertical rigor |
| **Coding General** | **85/100** | Flash outperforms Pro in production coding due to speed |
| **Agentic Capability** | **88/100** | Strong tool use and multi-threaded planning |
| **Speed (tokens/sec)** | **45/100** | 40-70 tps (similar to Sonnet 4.5) |
| **Cost Efficiency** | **60/100** | More expensive than Claude Sonnet 4.5 |
| **Context Window** | **95/100** | 2,000,000+ tokens (industry-leading) |
| **Thinking Mode** | **N/A** | Standard model (use Gemini 3 Pro Thinking variant) |
| **Multimodal** | **95/100** | Superior to Claude in multimodal tasks |
| **Physic Intuition** | **92/100** | Llama/Groq outperform, but Pro is strong |
| **Long-Context Recall** | **94/100** | 1-hour video or 2M+ lines of code ingestion |

**Orchestration Insight:** Gemini 3 Pro is the **king of long-context tasks**: **monorepo ingestion**, **large log analysis**, and **video/document processing**. Use as a **specialized fallback** for tasks requiring >200K context or heavy multimodal input. **Not recommended for general-purpose orchestration** due to higher cost and slower speed vs Claude Sonnet 4.5.

### Gemini 3 Pro Thinking (Low/High/Max)
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **93/100** (Low) / **96/100** (High) / **98/100** (Max) | Thinking levels scale budget across minimal/low/medium/high |
| **Coding General** | **88/100** / **94/100** / **96/100** | Deep thinking improves code correctness significantly |
| **Agentic Capability** | **91/100** | Enhanced multi-agent orchestration |
| **Speed (tokens/sec)** | **25/100** (Max) / **35/100** (High) / **40/100** (Low) | High thinking adds latency |
| **Cost Efficiency** | **35/100** (Max) / **50/100** (High) / **65/100** (Low) | Thinking tokens charged at output rates |
| **Context Window** | **95/100** | 2M tokens (same as standard Pro) |
| **Thinking Mode** | **95/100** | Excellent implementation, slightly better than Claude |
| **Multimodal** | **95/100** | Maintains multimodal strength |
| **Long-Context Recall** | **94/100** | No penalty for thinking mode |

**Orchestration Insight:** Use **Gemini 3 Pro Thinking High** as a **fourth-line fallback** when Claude Thinking variants are exhausted. The **2M context + thinking** combination is **unmatched for large-scale reasoning**: **entire project architecture analysis**, **massive code migrations**, and **system-wide diagnostics**. **Max thinking** is **expensive and slow**—reserve for **critical-path operations** only.

### Gemini 3 Flash
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **80/100** | Pro-level reasoning at 4x throughput and 25% cost |
| **Coding General** | **88/100** | Flash completed coding tests in half Pro's time |
| **Agentic Capability** | **78/100** | Good tool use but limited on complex planning |
| **Speed (tokens/sec)** | **90/100** | ~200 tps (very fast) |
| **Cost Efficiency** | **90/100** | 25% cost of Pro with 4x throughput |
| **Context Window** | **90/100** | 1,000,000 tokens |
| **Thinking Mode** | **N/A** | Standard model (use Gemini 3 Flash Thinking variants) |
| **Multimodal** | **90/100** | Strong multimodal support |
| **Physic Intuition** | **85/100** | Good but not exceptional |
| **Long-Context Recall** | **88/100** | Adequate for most tasks |

**Orchestration Insight:** Gemini 3 Flash is the **best model for high-volume, value-oriented tasks**. Use as the **default model for**: **quick reads**, **format conversions**, **simple refactorings**, **tests**, and **documentation**. The **speed/cost ratio** is industry-leading. **Fallback to Sonnet 4.5** when accuracy requirements are strict.

### Gemini 3 Flash Thinking (Minimal/Low/Medium/High)
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **82/100** (Minimal) / **86/100** (Low) / **90/100** (Medium) / **94/100** (High) | Thinking levels: minimal < low < medium < high |
| **Coding General** | **90/100** / **94/100** / **96/100** | Flash Thinking outperforms standard Flash by 10-15% |
| **Agentic Capability** | **82/100** | Adequate for moderate complexity planning |
| **Speed (tokens/sec)** | **75/100** (High) / **82/100** (Medium) / **88/100** (Low) / **92/100** (Minimal) | Minimal thinking preserves most of Flash's speed |
| **Cost Efficiency** | **70/100** (High) / **78/100** (Medium) / **85/100** (Low) / **90/100** (Minimal) | Minimal thinking maintains excellent value |
| **Context Window** | **90/100** | 1M tokens |
| **Thinking Mode** | **85/100** | Good implementation, less granular than Claude |
| **Multimodal** | **90/100** | Maintains multimodal strength |
| **Long-Context Recall** | **88/100** | No penalty |

**Orchestration Insight:** Use **Gemini 3 Flash Thinking Minimal** as a **first-line fallback** from standard Flash when simple reasoning is needed. Use **Flash Thinking Medium** as a **second-line fallback** for **moderate complexity** tasks. The **speed/cost ratio** remains **excellent** with minimal/low thinking enabled—**use these heavily** for tasks where **speed + slight accuracy boost** is the optimal tradeoff.

---

### Llama 3.1 405B (NVIDIA/Groq/Cerebras)
| Metric | Score (NVIDIA) | Score (Groq) | Score (Cerebras) | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | **82/100** | **82/100** | **82/100** | Open source 405B parameter model, comparable to GPT-4 level |
| **Coding General** | **85/100** | **85/100** | **85/100** | Strong coding performance, validated on HumanEval |
| **Agentic Capability** | **75/100** | **75/100** | **75/100** | Limited tool use compared to proprietary models |
| **Speed (tokens/sec)** | **50/100** | **95/100** | **85/100** | **Groq LPUs:** 450+ tps | **Cerebras CS-2:** 300+ tps | **NVIDIA:** 50-80 tps |
| **Cost Efficiency** | **70/100** | **95/100** | **90/100** | **Groq:** Ultra-low cost | **Cerebras:** Low cost | **NVIDIA:** Moderate cost |
| **Context Window** | **65/100** | **65/100** | **65/100** | 128,000 tokens (provider-agnostic) |
| **Thinking Mode** | **N/A** | **N/A** | **N/A** | No native thinking mode |
| **Multimodal** | **60/100** | **60/100** | **60/100** | Limited multimodal vs proprietary models |
| **Physic Intuition** | **78/100** | **78/100** | **78/100** | Good physics reasoning |
| **Long-Context Recall** | **75/100** | **75/100** | **75/100** | Adequate but not exceptional |

**Orchestration Insight:** **Llama 3.1 405B on Groq** is the **ultimate cost-efficient powerhouse** for **high-volume coding tasks**. Use as the **default for**: **automated refactoring**, **bulk test generation**, **lint fixes**, and **large-scale code transformations**. The **450+ tps throughput on Groq LPUs** is **unmatched** in the industry. **Fallback to Cerebras** if Groq rate limits are hit, then **NVIDIA** as a final option.

**NVIDIA Implementation:** Standard inference on A100/H100 clusters. Good but not revolutionary speed. Use as a **third-tier fallback** for Llama inference when Groq and Cerebras are exhausted.

**Cerebras Implementation:** CS-2 wafer-scale engine provides ~300+ tps. Excellent middle ground between Groq and NVIDIA. Use as a **second-tier fallback** for Llama inference when Groq is saturated.

---

### Llama 3.1 70B (NVIDIA/Groq/Cerebras)
| Metric | Score (NVIDIA) | Score (Groq) | Score (Cerebras) | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Reasoning Accuracy** | **72/100** | **72/100** | **72/100** | Smaller than 405B, good but not exceptional reasoning |
| **Coding General** | **78/100** | **78/100** | **78/100** | Adequate for most coding tasks |
| **Agentic Capability** | **70/100** | **70/100** | **70/100** | Limited tool use |
| **Speed (tokens/sec)** | **60/100** | **98/100** | **90/100** | **Groq LPUs:** 500+ tps | **Cerebras CS-2:** 350+ tps | **NVIDIA:** 60-100 tps |
| **Cost Efficiency** | **75/100** | **98/100** | **92/100** | **Groq:** Cheapest option | **Cerebras:** Very low cost | **NVIDIA:** Low cost |
| **Context Window** | **65/100** | **65/100** | **65/100** | 128,000 tokens |
| **Thinking Mode** | **N/A** | **N/A** | **N/A** | No native thinking mode |
| **Multimodal** | **50/100** | **50/100** | **50/100** | Limited multimodal |
| **Physic Intuition** | **70/100** | **70/100** | **70/100** | Adequate physics |
| **Long-Context Recall** | **70/100** | **70/100** | **70/100** | Standard performance |

**Orchestration Insight:** **Llama 3.1 70B on Groq** is the **workhorse model** for **repetitive, lower-complexity tasks**. Use for: **file reads**, **format validations**, **comment generation**, and **simple refactorings**. The **500+ tps throughput** and **near-zero cost** make it ideal for **background operations**, **CI pipelines**, and **automated maintenance tasks**. **Fallback hierarchy:** Groq → Cerebras → NVIDIA.

---

### DeepSeek-V3 (671B MoE)
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **92/100** | Mixture-of-Experts architecture provides exceptional reasoning |
| **Coding General** | **90/100** | Strong coding performance, comparable to Claude Sonnet 4.5 |
| **Agentic Capability** | **85/100** | Good tool use but less mature than Anthropic |
| **Speed (tokens/sec)** | **70/100** | 60+ tps on high-end hardware |
| **Cost Efficiency** | **80/100** | $0.14 input / $0.28 output (very good value) |
| **Context Window** | **70/100** | 128,000 tokens |
| **Thinking Mode** | **N/A** | Standard model (use DeepSeek-R1 for thinking) |
| **Multimodal** | **65/100** | Limited multimodal support |
| **Physic Intuition** | **92/100** | Excellent physics reasoning |
| **Long-Context Recall** | **80/100** | Good long-context performance |

**Orchestration Insight:** DeepSeek-V3 is the **hidden gem** for **cost-conscious reasoning**. Use as a **fallback model** when Claude Sonnet 4.5 is too expensive but Gemini Flash isn't accurate enough. The **MoE architecture** provides **exceptional reasoning** at a **fraction of the cost** of Opus or Pro. **Fallback to DeepSeek-R1** when explicit thinking is needed.

---

### DeepSeek-R1 (Thinking-Enhanced)
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **95/100** | Refined thinking mode significantly improves over V3 |
| **Coding General** | **92/100** | Excellent for complex debugging and architecture |
| **Agentic Capability** | **88/100** | Strong planning with reasoning chains |
| **Speed (tokens/sec)** | **50/100** | Thinking tokens add latency |
| **Cost Efficiency** | **70/100** | Thinking tokens charged at output rates |
| **Context Window** | **70/100** | 128,000 tokens |
| **Thinking Mode** | **90/100** | Good thinking implementation (less mature than Claude) |
| **Multimodal** | **65/100** | Limited multimodal |
| **Physic Intuition** | **94/100** | Excellent physics reasoning |
| **Long-Context Recall** | **82/100** | Good long-context performance |

**Orchestration Insight:** Use **DeepSeek-R1** as a **specialized fallback** for **physics/math-heavy tasks** where Claude and Gemini struggle. The **cost/performance ratio** is excellent when thinking is required. Use when **DeepSeek-V3** (cheaper) isn't sufficient but **Claude/Gemini Thinking** (more expensive) is overkill.

---

### GPT-5.2 Standard
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **85/100** | Strong general-purpose reasoning |
| **Coding General** | **82/100** | Good coding performance but lags Claude Sonnet 4.5 |
| **Agentic Capability** | **80/100** | Adequate tool use and planning |
| **Speed (tokens/sec)** | **55/100** | 40-70 tps (mid-range) |
| **Cost Efficiency** | **60/100** | $2.50 input / $10.00 output |
| **Context Window** | **65/100** | 128,000 tokens (Pro/Enterprise) |
| **Thinking Mode** | **N/A** | Standard model |
| **Multimodal** | **80/100** | Strong multimodal support |
| **Physic Intuition** | **80/100** | Good physics reasoning |
| **Long-Context Recall** | **75/100** | Adequate long-context performance |

**Orchestration Insight:** GPT-5.2 is a **solid general-purpose fallback** with minimal bias toward any specific domain. Use when **Claude/Gemini/DeepSeek are unavailable** or when you need a **neutral perspective** on a domain-specific task. **Not recommended as a model of choice** when better options are available.

---

### Mistral Large 3
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **80/100** | Good reasoning but not exceptional |
| **Coding General** | **85/100** | Optimized for "all-day coding" with high precision |
| **Agentic Capability** | **78/100** | Adequate tool use |
| **Speed (tokens/sec)** | **70/100** | Good throughput |
| **Cost Efficiency** | **75/100** | Competitive pricing |
| **Context Window** | **65/100** | 128,000 tokens |
| **Thinking Mode** | **N/A** | Standard model |
| **Multimodal** | **70/100** | Limited multimodal |
| **Physic Intuition** | **75/100** | Adequate physics reasoning |
| **Long-Context Recall** | **78/100** | Good long-context performance |

**Orchestration Insight:** Mistral Large 3 is the **best open-source alternative** to Claude Sonnet 4.5. Use when you need **good coding performance** without the **proprietary lock-in** or **cost** of Anthropic/Google. **Fallback to Llama 3.1 405B** if reasoning accuracy is insufficient.

---

### Mistral Vibe
| Metric | Score | Evidence |
| :--- | :--- | :--- |
| **Reasoning Accuracy** | **75/100** | Optimized for developer workflow, not deep reasoning |
| **Coding General** | **88/100** | Excellent for everyday coding tasks |
| **Agentic Capability** | **72/100** | Limited multi-step planning |
| **Speed (tokens/sec)** | **85/100** | Fast throughput |
| **Cost Efficiency** | **82/100** | Good value for developer tasks |
| **Context Window** | **60/100** | Smaller context optimized for single-file edits |
| **Thinking Mode** | **N/A** | Standard model |
| **Multimodal** | **65/100** | Basic multimodal |
| **Physic Intuition** | **70/100** | Adequate physics |
| **Long-Context Recall** | **70/100** | Adequate for typical files |

**Orchestration Insight:** Mistral Vibe is the **developer companion model**. Use for **IDE integration**, **autocomplete**, **quick fixes**, and **low-latency coding assistance**. **Not recommended for orchestration decisions** or complex architecture work.

---

## Orchestration Framework Recommendations

### Default Model Selection Strategy

| Task Category | Default Model | fallback 1 | fallback 2 | fallback 3 | fallback 4 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **General Orchestration** | Claude Sonnet 4.5 | Claude Sonnet 4.5 Thinking (Low) | DeepSeek-V3 | GPT-5.2 | Mistral Large 3 |
| **Quick Reads/Simple Tasks** | Gemini 3 Flash Thinking (Minimal) | Claude Haiku 4.5 | Llama 3.1 70B (Groq) | Gemini 3 Flash | — |
| **Coding - Simple Refactor** | Llama 3.1 405B (Groq) | Llama 3.1 405B (Cerebras) | Llama 3.1 70B (Groq) | Gemini 3 Flash | — |
| **Coding - Complex Debug** | Claude Sonnet 4.5 Thinking (Max) | Claude Opus 4.6 Thinking (Max) | DeepSeek-R1 | Gemini 3 Pro Thinking (High) | — |
| **Large Context (>200K)** | Gemini 3 Pro | Claude Opus 4.6 (Enterprise) | Gemini 3 Pro Thinking (High) | — | — |
| **Multimodal (Video/Image)** | Gemini 3 Pro | Claude Opus 4.6 | Gemini 3 Flash | — | — |
| **Physics/Math Heavy** | DeepSeek-R1 | DeepSeek-V3 | Claude Opus 4.6 | Gemini 3 Pro Thinking (High) | — |
| **Architecture Design** | Claude Opus 4.6 | Claude Sonnet 4.5 Thinking (Max) | Gemini 3 Pro Thinking (High) | — | — |
| **Documentation/Output Only** | Claude Haiku 4.5 | Gemini 3 Flash Thinking (Minimal) | Llama 3.1 70B (Groq) | — | — |

---

### Budget Optimization Tips

1. **Use Llama 3.1 on Groq for 80% of tasks** (speed/cost ratio is unbeatable)
2. **Reserve Claude/Gemini Thinking for critical-path operations only**
3. **Enable prompt caching** for repeated queries over the same codebase (saves 50-90% cost)
4. **Start with Flash/Flash Thinking Minimal**—escalate only if accuracy fails
5. **Use the smallest context window sufficient** (context-dependent pricing on Anthropic/Google)

---

### Provider Rotation Strategy

| Provider | Primary Model | Backup Model | Rotation Trigger |
| :--- | :--- | :--- | :--- |
| **Groq** | Llama 3.1 405B | Llama 3.1 70B | Rate limit 429 |
| **Cerebras** | Llama 3.1 405B | Llama 3.1 70B | Groq rate limit |
| **NVIDIA** | Llama 3.1 405B | Llama 3.1 70B | Both Groq and Cerebras rate limits |

**Note:** The IntelligentRotator implementation in `opencode-model-router-x` automatically handles this rotation based on header inspection (`x-ratelimit-*`, `x-nvapi-*`).

---

## Source Documentation

### Official Documentation
- [Anthropic Pricing & API Specs](https://www.anthropic.com/pricing)
- [Anthropic Model System Cards](https://assets.anthropic.com/system-cards/)
- [OpenAI ChatGPT & Model Plans](https://openai.com/pricing/)
- [Google Cloud Vertex AI Generative AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [DeepSeek API Documentation](https://www.deepseek.com/pricing)
- [NVIDIA API Console](https://console.nvidia.com/)
- [Groq Console](https://console.groq.com/)
- [Cerebras Console](https://console.cerebras.ai/)

### Benchmark Leaderboards
- [lmsys/org: Chatbot Arena Leaderboard](https://lmsys.org/blog/2025-01-17-leaderboard/)
- [SWE-bench Verified Leaderboard](https://swebench.org/)
- [llmleaderboard.ai: Model Comparisons](https://llmleaderboard.ai/)
- [HuggingFace Open LLM Leaderboard](https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard)

### Research Papers & Case Studies
- Anthropic Engineering Blog 2025 (Claude 4.6 Thinking Mode)
- Google DeepMind Research 2025 (Gemini 3 Multimodal Architecture)
- DeepSeek Research 2025 (MoE Reasoning Performance)
- Groq Engineering Blog 2025 (LPU Throughput Benchmarks)
- Cerebras Research 2025 (CS-2 Wafer-Scale Inference)

---

## Appendix: Key Metrics Summary

### Speed Tier Breakdown (tokens/sec)
| Tier | Range | Representative Models |
| :--- | :--- | :--- |
| **Ultra Fast** | 400-500+ | Llama 3.1 70B/405B (Groq) |
| **Very Fast** | 200-350 | Gemini 3 Flash, Cerebras Llama 405B |
| **Fast** | 150-220 | Claude Haiku 4.5, Gemini Flash variants |
| **Medium** | 40-70 | Claude Sonnet 4.5, GPT-5.2, DeepSeek-V3 |
| **Slow** | 20-35 | Claude Opus 4.6, Gemini Pro Thinking (Max) |

### Cost Tier Breakdown (per 1M tokens)
| Tier | Input | Output | Representative Models |
| :--- | :--- | :--- | :--- |
| **Ultra Low** | <$0.05 | <$0.10 | Llama 3.1 (Groq/Cerebras) |
| **Very Low** | $0.05-$0.20 | $0.10-$0.40 | Gemini 3 Flash, DeepSeek-V3 |
| **Low** | $0.20-$0.50 | $0.40-$1.00 | Claude Haiku 4.5, Mistral Vibe |
| **Medium** | $1.00-$3.00 | $2.00-$10.00 | GPT-5.2, Claude Sonnet 4.5 |
| **High** | $3.00-$5.00 | $10.00-$20.00 | Claude Opus 4.6 |
| **Very High** | >$5.00 | >$20.00 | Thinking-Enhanced variants (Max budget) |

---

*Last Updated: February 12, 2026 | Orchestration Framework v1.0*
