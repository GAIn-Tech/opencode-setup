// SecurityVeto Pattern Example
// Demonstrates mandatory fail-closed enforcement for context budget management

const { SecurityVeto } = require('opencode-validator');
const { ContextBridge } = require('opencode-integration-layer');

class BudgetAwareWorkflow {
  constructor() {
    this.veto = new SecurityVeto();
    this.contextBridge = new ContextBridge();
    this.sessionId = 'workflow-' + Date.now();
  }

  /**
   * Example: Execute a task with budget-aware enforcement
   * Shows how VISION fail-closed patterns prevent resource exhaustion
   */
  async executeTask(taskName, taskFn, estimatedTokens) {
    console.log(`Starting task: ${taskName}`);
    
    // 1. Check budget before execution
    const budgetStatus = await this.contextBridge.getBudgetStatus(this.sessionId, 'gpt-5');
    console.log(`Current budget: ${budgetStatus.percentage}%`);
    
    // 2. Apply SecurityVeto decision
    const vetoDecision = this.veto.evaluate(
      budgetStatus.percentage,
      this.sessionId,
      {
        taskName,
        estimatedTokens,
        priority: 'high'
      }
    );
    
    // 3. Handle veto decisions
    switch (vetoDecision.action) {
      case 'block':
        console.error(`❌ Task blocked by SecurityVeto: ${vetoDecision.reason}`);
        throw new Error(`SECURITY_VETO_BLOCKED: ${vetoDecision.reason}`);
        
      case 'compress':
        console.warn(`⚠️  Task requires compression: ${vetoDecision.reason}`);
        // Apply mandatory compression
        const compressedContext = await this.contextBridge.compressContext();
        return this.executeCompressedTask(taskFn, compressedContext);
        
      case 'allow':
        console.log(`✅ Task allowed with conditions: ${vetoDecision.conditions?.join(', ')}`);
        // Execute with any conditions
        return this.executeWithConditions(taskFn, vetoDecision.conditions);
        
      case 'unrestricted':
        console.log(`✅ Task allowed without restrictions`);
        return taskFn();
        
      default:
        throw new Error(`Unknown veto decision: ${vetoDecision.action}`);
    }
  }

  /**
   * Example: Real-world workflow with progressive budget enforcement
   */
  async processDocument(documentPath) {
    const tasks = [
      {
        name: 'document_analysis',
        fn: () => this.analyzeDocument(documentPath),
        tokens: 2000
      },
      {
        name: 'entity_extraction',
        fn: () => this.extractEntities(documentPath),
        tokens: 1500
      },
      {
        name: 'summary_generation',
        fn: () => this.generateSummary(documentPath),
        tokens: 1000
      }
    ];

    const results = [];
    
    for (const task of tasks) {
      try {
        const result = await this.executeTask(
          task.name,
          task.fn,
          task.tokens
        );
        results.push(result);
        
        // Update budget after successful execution
        await this.contextBridge.recordTokenUsage(
          this.sessionId,
          'gpt-5',
          task.tokens
        );
        
      } catch (error) {
        if (error.message.includes('SECURITY_VETO_BLOCKED')) {
          console.log(`Workflow stopped by SecurityVeto to prevent resource exhaustion`);
          break;
        }
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Example: Batch processing with budget awareness
   */
  async batchProcess(documents, maxBudgetPercentage = 70) {
    console.log(`Batch processing ${documents.length} documents`);
    
    const veto = new SecurityVeto();
    const processed = [];
    const blocked = [];
    
    for (const doc of documents) {
      const budgetStatus = await this.contextBridge.getBudgetStatus(
        this.sessionId,
        'gpt-5'
      );
      
      const decision = veto.evaluate(
        budgetStatus.percentage,
        this.sessionId,
        { document: doc.name }
      );
      
      if (decision.action === 'block') {
        console.warn(`Document "${doc.name}" blocked: ${decision.reason}`);
        blocked.push({
          document: doc.name,
          reason: decision.reason,
          budgetAtBlock: budgetStatus.percentage
        });
        continue;
      }
      
      try {
        const result = await this.processDocument(doc.path);
        processed.push({ document: doc.name, result });
      } catch (error) {
        console.error(`Failed to process "${doc.name}":`, error.message);
      }
    }
    
    return { processed, blocked };
  }

  /**
   * Example: Recovery from veto block
   */
  async recoverFromVetoBlock() {
    console.log('Attempting recovery from SecurityVeto block...');
    
    // 1. Check current status
    const budgetStatus = await this.contextBridge.getBudgetStatus(
      this.sessionId,
      'gpt-5'
    );
    
    // 2. If blocked, try compression strategy
    if (budgetStatus.percentage >= 85) {
      console.log(`Budget critical at ${budgetStatus.percentage}%`);
      
      // Try aggressive compression
      const compressed = await this.contextBridge.compressContext({
        mode: 'aggressive',
        targetReduction: 0.5  // Target 50% reduction
      });
      
      // Re-evaluate after compression
      const newBudget = budgetStatus.percentage * 0.5; // Assume 50% reduction
      const vetoDecision = this.veto.evaluate(newBudget, this.sessionId);
      
      if (vetoDecision.action !== 'block') {
        console.log(`✅ Recovery successful! Budget reduced to ${newBudget}%`);
        return { recovered: true, newBudget };
      }
    }
    
    return { recovered: false, budget: budgetStatus.percentage };
  }

  // Mock implementation methods
  async analyzeDocument(path) {
    return { analysis: 'complete', path };
  }
  
  async extractEntities(path) {
    return { entities: ['entity1', 'entity2'], path };
  }
  
  async generateSummary(path) {
    return { summary: 'Document summary', path };
  }
  
  async executeCompressedTask(taskFn, compressedContext) {
    // Execute task with compressed context
    return taskFn();
  }
  
  async executeWithConditions(taskFn, conditions) {
    // Execute task with conditions applied
    return taskFn();
  }
}

/**
 * Usage Examples
 */
async function demonstrateSecurityVeto() {
  console.log('=== SecurityVeto Pattern Demonstration ===\n');
  
  const workflow = new BudgetAwareWorkflow();
  
  // Example 1: Normal operation
  console.log('1. Normal operation with budget < 75%:');
  try {
    const result = await workflow.executeTask(
      'test_task',
      () => ({ success: true }),
      500
    );
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n2. Operation with budget at 80% (compression required):');
  // Simulate high budget
  await workflow.contextBridge.recordTokenUsage(
    workflow.sessionId,
    'gpt-5',
    80000  // Large token usage to trigger high budget
  );
  
  try {
    const result = await workflow.executeTask(
      'high_budget_task',
      () => ({ success: true }),
      1000
    );
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n3. Operation with budget at 90% (blocked):');
  // Simulate critical budget
  await workflow.contextBridge.recordTokenUsage(
    workflow.sessionId,
    'gpt-5',
    90000  // Trigger block threshold
  );
  
  try {
    const result = await workflow.executeTask(
      'critical_budget_task',
      () => ({ success: true }),
      500
    );
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n4. Batch processing with veto enforcement:');
  const documents = [
    { name: 'doc1.txt', path: '/path/to/doc1' },
    { name: 'doc2.txt', path: '/path/to/doc2' },
    { name: 'doc3.txt', path: '/path/to/doc3' }
  ];
  
  const batchResult = await workflow.batchProcess(documents);
  console.log('Processed:', batchResult.processed.length);
  console.log('Blocked:', batchResult.blocked.length);
  
  console.log('\n5. Recovery demonstration:');
  const recoveryResult = await workflow.recoverFromVetoBlock();
  console.log('Recovery:', recoveryResult.recovered ? '✅ Success' : '❌ Failed');
  
  console.log('\n=== Demonstration Complete ===');
}

// Run demonstration
if (require.main === module) {
  demonstrateSecurityVeto().catch(console.error);
}

module.exports = { BudgetAwareWorkflow, demonstrateSecurityVeto };