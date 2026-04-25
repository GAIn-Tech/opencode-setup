'use strict';

const { scoreMemory } = require('./memory-scoring.js');
const { recordAccess } = require('./memory-temporal.js');
const { getTemporalStats } = require('./memory-temporal.js');

const DEFAULT_CONTEXT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_MAX_MEMORIES = 10;
const DEFAULT_MIN_SCORE = 0.3;

/**
 * Memory Context Provider
 *
 * Surfaces relevant memories for the current task context:
 * - Takes a task description/query
 * - Optionally takes agent type and project
 * - Returns scored, ranked memories with access tracking
 * - Integrates with MemoryBridge for recall
 * - Uses TemporalIntelligence for optimal recall timing
 */
class MemoryContextProvider {
  /**
   * @param {object} opts
   * @param {object} opts.memoryBridge - MemoryBridge instance
   * @param {object} [opts.accessLog] - Map<memoryId, timestamp[]> for temporal tracking
   * @param {number} [opts.contextWindowDays] - How far back to consider memories (default 30)
   * @param {number} [opts.maxMemories] - Max memories to return (default 10)
   * @param {number} [opts.minScore] - Minimum relevance score (default 0.3)
   */
  constructor(opts = {}) {
    this._bridge = opts.memoryBridge;
    if (!this._bridge) {
      throw new Error('[MemoryContextProvider] memoryBridge is required');
    }
    this._accessLog = opts.accessLog || new Map();
    this._contextWindowDays = opts.contextWindowDays || 30;
    this._maxMemories = opts.maxMemories || DEFAULT_MAX_MEMORIES;
    this._minScore = opts.minScore || DEFAULT_MIN_SCORE;
  }

  /**
   * Get relevant memories for a task context.
   *
   * Flow:
   * 1. Recall memories matching task query
   * 2. Score each memory for relevance
   * 3. Filter by minimum score
   * 4. Apply temporal intelligence (boost recently accessed, penalize overdue)
   * 5. Record access patterns
   * 6. Return top N memories with context
   *
   * @param {object} request
   * @param {string} request.task - Task description or query
   * @param {string} [request.agentType] - Type of agent (coding, writing, etc.)
   * @param {string} [request.project] - Project name for scoping
   * @param {string[]} [request.entities] - Known entities in the task
   * @returns {Promise<{memories: object[], metadata: object}>}
   */
  async getContext(request) {
    const { task, agentType, project, entities = [] } = request;

    if (!task || typeof task !== 'string') {
      throw new Error('[MemoryContextProvider] task is required');
    }

    // Step 1: Recall memories
    const recallResult = await this._bridge.recall(task, { project });

    if (recallResult.status === 'degraded' || recallResult.memories.length === 0) {
      return {
        memories: [],
        metadata: {
          total: 0,
          status: recallResult.status,
          task,
          agentType,
          project,
        },
      };
    }

    // Step 2: Score each memory
    const scoredMemories = await Promise.all(
      recallResult.memories.map(async (memory) => {
        const score = await scoreMemory(memory, {
          query: task,
          queryEntities: entities,
          now: Date.now(),
        });

        return { ...memory, _relevanceScore: score };
      }),
    );

    // Step 3: Get temporal stats for each memory
    const memoriesWithTemporal = scoredMemories.map((memory) => {
      const timestamps = this._accessLog.get(memory.id) || [];
      const temporal = getTemporalStats(timestamps, memory.retention);

      // Boost if memory was recently accessed (recency bonus)
      // Penalize if recall window has passed (overdue bonus)
      let temporalBonus = 0;
      if (temporal.recallWindowHours === 0 && temporal.accessCount > 0) {
        // Ready for recall - small boost
        temporalBonus = 0.05;
      } else if (temporal.recallWindowHours < 0) {
        // Overdue - larger boost
        temporalBonus = 0.15;
      }

      return {
        ...memory,
        _temporalBonus: temporalBonus,
        _temporalStats: temporal,
      };
    });

    // Step 4: Calculate final score with temporal bonus
    const finalMemories = memoriesWithTemporal
      .map((memory) => ({
        ...memory,
        _finalScore: Math.min(1, memory._relevanceScore.total + memory._temporalBonus),
      }))
      .filter((m) => m._finalScore >= this._minScore)
      .sort((a, b) => b._finalScore - a._finalScore)
      .slice(0, this._maxMemories);

    // Step 5: Record access patterns
    for (const memory of finalMemories) {
      recordAccess(this._accessLog, memory.id, Date.now());
    }

    // Step 6: Build context summary
    const contextSummary = this._buildContextSummary(finalMemories, agentType);

    return {
      memories: finalMemories,
      metadata: {
        total: finalMemories.length,
        query: task,
        agentType,
        project,
        recallStatus: recallResult.status,
        recallCount: recallResult.memories.length,
        contextWindowDays: this._contextWindowDays,
      },
      summary: contextSummary,
    };
  }

  /**
   * Inject memory context into a prompt/task.
   *
   * @param {object} request
   * @param {string} request.task - Task description
   * @param {string} [request.agentType] - Agent type
   * @param {string} [request.project] - Project name
   * @param {string[]} [request.entities] - Task entities
   * @returns {Promise<string>} Context string to inject into prompt
   */
  async injectContext(request) {
    const { memories, summary } = await this.getContext(request);

    if (memories.length === 0) {
      return '';
    }

    return this._formatContextForPrompt(memories, summary, request.agentType);
  }

  /**
   * Check if memory context should be injected based on task type.
   *
   * @param {string} taskType - Type of task
   * @returns {boolean} Whether to inject memory context
   */
  shouldInjectContext(taskType) {
    // Map of task types that benefit from memory context
    const memoryBeneficialTasks = {
      coding: true,
      refactoring: true,
      debugging: true,
      writing: true,
      review: true,
      architecture: true,
      planning: true,
    };

    // Default to true for unknown types (safe default)
    return memoryBeneficialTasks[taskType] ?? true;
  }

  // --- Private helpers ---

  _buildContextSummary(memories, agentType) {
    if (memories.length === 0) {
      return { types: {}, avgScore: 0, total: 0 };
    }

    const types = {};
    let totalScore = 0;

    for (const memory of memories) {
      types[memory.type] = (types[memory.type] || 0) + 1;
      totalScore += memory._finalScore;
    }

    return {
      types,
      avgScore: Math.round((totalScore / memories.length) * 100) / 100,
      total: memories.length,
    };
  }

  _formatContextForPrompt(memories, summary, agentType) {
    const lines = [
      '## Relevant Memory Context',
      '',
      `Found ${summary.total} relevant memories (avg relevance: ${summary.avgScore}):`,
      '',
    ];

    // Group by type
    const byType = {};
    for (const memory of memories) {
      if (!byType[memory.type]) {
        byType[memory.type] = [];
      }
      byType[memory.type].push(memory);
    }

    for (const [type, typeMemories] of Object.entries(byType)) {
      lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
      for (const memory of typeMemories) {
        const relevance = Math.round(memory._finalScore * 100);
        const accessCount = memory._temporalStats?.accessCount || 0;
        lines.push(`- [${relevance}%] ${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}`);
        if (accessCount > 0) {
          lines.push(`  (accessed ${accessCount}x previously)`);
        }
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('*This context was retrieved from memory. Prioritize relevant items above.*');

    return lines.join('\n');
  }
}

module.exports = { MemoryContextProvider };