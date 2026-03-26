// TelemetryQualityGate Pattern Example
// Demonstrates VISION telemetry quality patterns for data integrity

const { TelemetryQualityGate } = require('opencode-model-manager');
const { MetricsCollector } = require('opencode-model-manager');

class QualityAwareTelemetry {
  constructor() {
    this.qualityGate = new TelemetryQualityGate({
      validationEnabled: true,
      requiredFields: [
        'event',
        'timestamp',
        'session_id',
        'component'
      ],
      schemaValidation: {
        event: { type: 'string', required: true },
        timestamp: { type: 'number', required: true },
        session_id: { type: 'string', required: true },
        component: { type: 'string', required: true },
        metadata: { type: 'object', required: false }
      },
      qualityThreshold: 0.95, // 95% quality required
      degradationDetection: {
        windowSize: 100, // Last 100 events
        threshold: 0.10 // 10% degradation triggers alert
      }
    });
    
    this.metricsCollector = new MetricsCollector();
    this.qualityIssues = [];
    this.qualityTrends = [];
  }

  /**
   * Example: Record telemetry with quality validation
   * Shows how TelemetryQualityGate ensures data integrity
   */
  async recordTelemetry(eventData) {
    console.log(`Recording telemetry: ${eventData.event}`);
    
    // 1. Validate telemetry quality
    const qualityCheck = this.qualityGate.validate(eventData);
    
    // 2. Handle quality issues
    if (!qualityCheck.valid) {
      console.warn(`⚠️  Telemetry quality issues:`, qualityCheck.issues);
      this.handleQualityIssues(qualityCheck);
      
      // Decide based on severity
      if (qualityCheck.severity === 'critical') {
        console.error(`❌ Critical quality issue - event rejected`);
        return {
          recorded: false,
          reason: 'critical_quality_issue',
          issues: qualityCheck.issues
        };
      }
      
      // For non-critical issues, we can still record but with warnings
      console.log(`⚠️  Recording with quality warnings`);
    }
    
    // 3. Record validated telemetry
    try {
      const recordId = await this.metricsCollector.recordEvent({
        ...eventData,
        quality_score: qualityCheck.score,
        validation_timestamp: Date.now()
      });
      
      // 4. Update quality trends
      this.updateQualityTrends(qualityCheck);
      
      console.log(`✅ Telemetry recorded with quality score: ${qualityCheck.score.toFixed(2)}`);
      return {
        recorded: true,
        recordId,
        qualityScore: qualityCheck.score,
        warnings: qualityCheck.issues
      };
      
    } catch (error) {
      console.error(`❌ Failed to record telemetry:`, error.message);
      return {
        recorded: false,
        error: error.message
      };
    }
  }

  /**
   * Example: Batch telemetry processing with quality aggregation
   */
  async processBatchTelemetry(events) {
    console.log(`Processing batch of ${events.length} telemetry events`);
    
    const results = {
      valid: [],
      invalid: [],
      qualityScores: [],
      aggregatedQuality: null
    };
    
    for (const event of events) {
      const qualityCheck = this.qualityGate.validate(event);
      
      if (qualityCheck.valid && qualityCheck.score >= 0.8) {
        // Record valid events
        const recordResult = await this.recordTelemetry(event);
        results.valid.push({
          event: event.event,
          qualityScore: qualityCheck.score,
          recordResult
        });
      } else {
        // Handle invalid events
        results.invalid.push({
          event: event.event,
          issues: qualityCheck.issues,
          score: qualityCheck.score
        });
        
        this.handleQualityIssues(qualityCheck);
      }
      
      results.qualityScores.push(qualityCheck.score);
    }
    
    // Calculate aggregated quality
    if (results.qualityScores.length > 0) {
      const avgScore = results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length;
      results.aggregatedQuality = {
        averageScore: avgScore,
        validPercentage: (results.valid.length / events.length) * 100,
        degradationDetected: avgScore < this.qualityGate.config.qualityThreshold
      };
    }
    
    console.log(`Batch processing complete:`);
    console.log(`- Valid: ${results.valid.length}`);
    console.log(`- Invalid: ${results.invalid.length}`);
    console.log(`- Average quality: ${results.aggregatedQuality?.averageScore.toFixed(2)}`);
    
    return results;
  }

  /**
   * Example: Real-time quality monitoring
   */
  async monitorTelemetryQuality(sampleIntervalMs = 5000) {
    console.log('Starting real-time telemetry quality monitoring');
    
    const monitor = setInterval(async () => {
      // Get recent quality trends
      const recentTrends = this.qualityTrends.slice(-20); // Last 20 checks
      
      if (recentTrends.length > 0) {
        const avgScore = recentTrends.reduce((a, b) => a + b.score, 0) / recentTrends.length;
        const issueCount = recentTrends.filter(t => !t.valid).length;
        
        console.log(`[Quality Monitor] Score: ${avgScore.toFixed(2)}, Issues: ${issueCount}`);
        
        // Check for degradation
        if (avgScore < this.qualityGate.config.qualityThreshold) {
          console.warn(`[Quality Monitor] ⚠️  Quality degradation detected!`);
          this.triggerQualityAlert({
            type: 'degradation',
            averageScore: avgScore,
            threshold: this.qualityGate.config.qualityThreshold,
            recentIssues: this.qualityIssues.slice(-5)
          });
        }
      }
    }, sampleIntervalMs);
    
    return {
      stop: () => {
        clearInterval(monitor);
        console.log('Quality monitoring stopped');
      }
    };
  }

  /**
   * Example: Quality-aware data aggregation
   */
  async aggregateWithQualityWeights(timeRange) {
    console.log(`Aggregating telemetry with quality weights`);
    
    // Get raw metrics
    const rawMetrics = await this.metricsCollector.getMetrics(timeRange);
    
    if (!rawMetrics || rawMetrics.length === 0) {
      return { aggregated: null, message: 'No data in time range' };
    }
    
    // Apply quality weights to aggregation
    const weightedAggregation = rawMetrics.reduce((acc, metric) => {
      const qualityScore = metric.quality_score || 0.5; // Default if missing
      const weight = qualityScore; // Higher quality = higher weight
      
      // Weighted aggregation
      if (metric.event === 'model_inference') {
        acc.totalInferences = (acc.totalInferences || 0) + 1;
        acc.weightedTokens = (acc.weightedTokens || 0) + (metric.tokens_used || 0) * weight;
        acc.qualityWeightedTokens = (acc.qualityWeightedTokens || 0) + (metric.tokens_used || 0) * weight;
      }
      
      // Track quality distribution
      acc.qualityScores.push(qualityScore);
      
      return acc;
    }, { qualityScores: [] });
    
    // Calculate quality statistics
    if (weightedAggregation.qualityScores.length > 0) {
      weightedAggregation.averageQuality = weightedAggregation.qualityScores.reduce((a, b) => a + b, 0) / weightedAggregation.qualityScores.length;
      weightedAggregation.qualityStdDev = this.calculateStdDev(weightedAggregation.qualityScores);
    }
    
    console.log(`Aggregation complete:`);
    console.log(`- Total inferences: ${weightedAggregation.totalInferences}`);
    console.log(`- Average quality: ${weightedAggregation.averageQuality?.toFixed(2)}`);
    
    return weightedAggregation;
  }

  /**
   * Example: Automated quality improvement
   */
  async improveTelemetryQuality() {
    console.log('Analyzing telemetry quality for improvement opportunities');
    
    // Analyze recent quality issues
    const recentIssues = this.qualityIssues.slice(-50);
    
    if (recentIssues.length === 0) {
      console.log('✅ No quality issues detected');
      return { improved: false, message: 'No issues to improve' };
    }
    
    // Group issues by type
    const issueTypes = {};
    recentIssues.forEach(issue => {
      const type = issue.issue;
      issueTypes[type] = (issueTypes[type] || 0) + 1;
    });
    
    console.log('Quality issue analysis:');
    Object.entries(issueTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} occurrences`);
    });
    
    // Generate improvement suggestions
    const improvements = [];
    
    if (issueTypes.missing_timestamp > 10) {
      improvements.push({
        issue: 'missing_timestamp',
        suggestion: 'Add timestamp validation to event producers',
        priority: 'high'
      });
    }
    
    if (issueTypes.invalid_session_id > 5) {
      improvements.push({
        issue: 'invalid_session_id',
        suggestion: 'Implement session ID generation middleware',
        priority: 'medium'
      });
    }
    
    if (issueTypes.schema_mismatch > 3) {
      improvements.push({
        issue: 'schema_mismatch',
        suggestion: 'Update event schema documentation and validation',
        priority: 'medium'
      });
    }
    
    console.log(`Generated ${improvements.length} improvement suggestions`);
    return {
      improved: improvements.length > 0,
      suggestions: improvements,
      issueSummary: issueTypes
    };
  }

  // Helper methods
  handleQualityIssues(qualityCheck) {
    if (!qualityCheck.valid) {
      this.qualityIssues.push({
        timestamp: Date.now(),
        score: qualityCheck.score,
        issues: qualityCheck.issues,
        severity: qualityCheck.severity
      });
      
      // Keep only recent issues
      if (this.qualityIssues.length > 1000) {
        this.qualityIssues = this.qualityIssues.slice(-1000);
      }
    }
  }
  
  updateQualityTrends(qualityCheck) {
    this.qualityTrends.push({
      timestamp: Date.now(),
      score: qualityCheck.score,
      valid: qualityCheck.valid
    });
    
    // Keep only recent trends
    if (this.qualityTrends.length > 500) {
      this.qualityTrends = this.qualityTrends.slice(-500);
    }
  }
  
  triggerQualityAlert(alertData) {
    console.error(`🔴 QUALITY ALERT:`, alertData);
    // In production, this would trigger notifications, dashboards, etc.
  }
  
  calculateStdDev(numbers) {
    const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}

/**
 * Usage Examples
 */
async function demonstrateTelemetryQuality() {
  console.log('=== TelemetryQualityGate Pattern Demonstration ===\n');
  
  const telemetrySystem = new QualityAwareTelemetry();
  
  // Example 1: Valid telemetry recording
  console.log('1. Recording valid telemetry:');
  const validEvent = {
    event: 'model_inference',
    timestamp: Date.now(),
    session_id: 'session-123',
    component: 'model_router',
    model: 'gpt-5',
    tokens_used: 1500,
    latency_ms: 245,
    metadata: {
      route: 'primary',
      cache_hit: false
    }
  };
  
  const validResult = await telemetrySystem.recordTelemetry(validEvent);
  console.log('Result:', validResult.recorded ? '✅ Recorded' : '❌ Failed');
  console.log('Quality score:', validResult.qualityScore?.toFixed(2));
  
  // Example 2: Invalid telemetry (missing required fields)
  console.log('\n2. Recording invalid telemetry (missing fields):');
  const invalidEvent = {
    event: 'model_inference',
    // Missing timestamp
    // Missing session_id
    component: 'model_router',
    tokens_used: 1000
  };
  
  const invalidResult = await telemetrySystem.recordTelemetry(invalidEvent);
  console.log('Result:', invalidResult.recorded ? '✅ Recorded' : '❌ Failed');
  if (invalidResult.issues) {
    console.log('Issues:', invalidResult.issues);
  }
  
  // Example 3: Batch processing
  console.log('\n3. Batch telemetry processing:');
  const batchEvents = [
    { event: 'model_inference', timestamp: Date.now(), session_id: 's1', component: 'router', tokens_used: 1000 },
    { event: 'model_inference', timestamp: Date.now(), session_id: 's2', component: 'router', tokens_used: 1500 },
    { event: 'cache_hit', timestamp: Date.now(), session_id: 's3', component: 'cache' }, // Missing tokens_used
    { event: 'error', timestamp: Date.now() }, // Missing component
    { event: 'model_inference', timestamp: Date.now(), session_id: 's5', component: 'router', tokens_used: 2000, quality: 'high' }
  ];
  
  const batchResult = await telemetrySystem.processBatchTelemetry(batchEvents);
  console.log('Batch summary:');
  console.log('- Valid events:', batchResult.valid.length);
  console.log('- Invalid events:', batchResult.invalid.length);
  console.log('- Average quality:', batchResult.aggregatedQuality?.averageScore.toFixed(2));
  
  // Example 4: Quality monitoring
  console.log('\n4. Starting real-time quality monitoring (10 seconds):');
  const monitor = await telemetrySystem.monitorTelemetryQuality(2000);
  
  // Record some events while monitoring
  setTimeout(async () => {
    console.log('Recording events during monitoring...');
    for (let i = 0; i < 5; i++) {
      await telemetrySystem.recordTelemetry({
        event: `test_event_${i}`,
        timestamp: Date.now(),
        session_id: `monitor-session-${i}`,
        component: 'monitor',
        iteration: i
      });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }, 1000);
  
  // Stop monitoring after 10 seconds
  setTimeout(async () => {
    monitor.stop();
    
    // Example 5: Quality-aware aggregation
    console.log('\n5. Quality-weighted aggregation:');
    const aggregation = await telemetrySystem.aggregateWithQualityWeights({
      start: Date.now() - 3600000, // Last hour
      end: Date.now()
    });
    console.log('Aggregation result:', aggregation);
    
    // Example 6: Quality improvement analysis
    console.log('\n6. Quality improvement analysis:');
    const improvements = await telemetrySystem.improveTelemetryQuality();
    console.log('Improvement suggestions:', improvements.suggestions?.length || 0);
    
    console.log('\n=== Demonstration Complete ===');
  }, 10000);
}

// Run demonstration
if (require.main === module) {
  demonstrateTelemetryQuality().catch(console.error);
}

module.exports = { QualityAwareTelemetry, demonstrateTelemetryQuality };