'use strict';

class ExplorationRLAdapter {
  constructor({ comprehensionMemory, skillRLManager } = {}) {
    if (!comprehensionMemory || !comprehensionMemory.db) {
      throw new Error('ExplorationRLAdapter requires comprehensionMemory with db');
    }
    if (!skillRLManager || typeof skillRLManager.recordOutcome !== 'function') {
      throw new Error('ExplorationRLAdapter requires skillRLManager.recordOutcome');
    }

    this.comprehensionMemory = comprehensionMemory;
    this.skillRLManager = skillRLManager;
  }

  _getPerformanceColumns() {
    const columns = this.comprehensionMemory.db.prepare('PRAGMA table_info(model_performance)').all();
    const names = new Set(columns.map((column) => column.name));

    const latencyColumn = names.has('latency_ms') ? 'latency_ms' : 'latency';
    const costColumn = names.has('cost_usd') ? 'cost_usd' : 'cost';
    const reasoningColumn = names.has('avg_reasoning_efficiency')
      ? 'avg_reasoning_efficiency'
      : (names.has('reasoning_efficiency') ? 'reasoning_efficiency' : null);

    return {
      latencyColumn,
      costColumn,
      reasoningColumn,
    };
  }

  getAllMetricsForTask(taskCategory) {
    const { latencyColumn, costColumn, reasoningColumn } = this._getPerformanceColumns();
    const reasoningSelect = reasoningColumn
      ? `, AVG(${reasoningColumn}) as avg_reasoning_efficiency`
      : ', 0.0 as avg_reasoning_efficiency';

    const sql = `
      SELECT
        model_id,
        COUNT(*) as total_samples,
        AVG(accuracy) as avg_quality,
        AVG(${latencyColumn}) as avg_latency,
        AVG(${costColumn}) as avg_cost,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
        ${reasoningSelect}
      FROM model_performance
      WHERE intent_category = ?
      GROUP BY model_id
    `;

    return this.comprehensionMemory.db.prepare(sql).all(taskCategory);
  }

  updateFromExploration(taskCategory) {
    const metrics = this.getAllMetricsForTask(taskCategory);

    for (const row of metrics) {
      const featureVector = [
        Number(row.avg_quality || 0),
        Number(row.avg_latency || 0),
        Number(row.avg_cost || 0),
        Number(row.success_rate || 0),
        Number(row.avg_reasoning_efficiency || 0),
      ];

      this.skillRLManager.recordOutcome({
        skills: [`model:${row.model_id}`],
        success: featureVector[3] >= 0.5,
        tokens_used: Number(row.total_samples || 0),
        context: {
          source: 'exploration-adapter',
          task_category: taskCategory,
          model_id: row.model_id,
          total_samples: Number(row.total_samples || 0),
          feature_vector: featureVector,
          exploration_metrics: {
            avg_quality: featureVector[0],
            avg_latency: featureVector[1],
            avg_cost: featureVector[2],
            success_rate: featureVector[3],
            avg_reasoning_efficiency: featureVector[4],
          },
        },
      });
    }

    return {
      modelsProcessed: metrics.length,
      taskCategory,
    };
  }

  getBestModelRecommendation(taskCategory) {
    const metrics = this.getAllMetricsForTask(taskCategory);
    if (metrics.length === 0) {
      return null;
    }

    let bestModelId = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const row of metrics) {
      const quality = Number(row.avg_quality || 0);
      const success = Number(row.success_rate || 0);
      const reasoning = Number(row.avg_reasoning_efficiency || 0);
      const latency = Number(row.avg_latency || 0);
      const cost = Number(row.avg_cost || 0);
      const latencyScore = 1 / (1 + (latency / 1000));
      const costScore = 1 / (1 + (cost * 100));

      const score =
        (0.35 * quality) +
        (0.35 * success) +
        (0.15 * reasoning) +
        (0.1 * latencyScore) +
        (0.05 * costScore);

      if (score > bestScore) {
        bestScore = score;
        bestModelId = row.model_id;
      }
    }

    return bestModelId;
  }
}

module.exports = { ExplorationRLAdapter };
