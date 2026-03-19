// EnhancedSandbox Pattern Example
// Demonstrates VISION isolation patterns for secure, isolated execution

const { EnhancedSandbox } = require('opencode-crash-guard');

class IsolatedWorkflow {
  constructor() {
    this.sandboxConfigs = {
      lenient: {
        isolationLevel: 'lenient',
        cleanupTimeout: 3000,
        resourceLimits: {
          memoryMB: 256,
          cpuPercent: 30
        }
      },
      moderate: {
        isolationLevel: 'moderate',
        cleanupTimeout: 5000,
        resourceLimits: {
          memoryMB: 512,
          cpuPercent: 50
        }
      },
      strict: {
        isolationLevel: 'strict',
        cleanupTimeout: 10000,
        resourceLimits: {
          memoryMB: 1024,
          cpuPercent: 80,
          networkAccess: false,
          filesystemAccess: 'readonly'
        }
      }
    };
  }

  /**
   * Example: Safe execution of untrusted code
   * Shows how EnhancedSandbox prevents system contamination
   */
  async executeUntrustedCode(code, inputs, isolationLevel = 'moderate') {
    console.log(`Executing untrusted code with ${isolationLevel} isolation`);
    
    const sandbox = new EnhancedSandbox(this.sandboxConfigs[isolationLevel]);
    
    try {
      // Run code in isolated environment
      const result = await sandbox.run(() => {
        // This code runs in complete isolation
        const fn = new Function('inputs', code);
        return fn(inputs);
      });
      
      console.log(`✅ Code executed successfully in sandbox`);
      return {
        success: true,
        result,
        sandboxStats: sandbox.getStats()
      };
      
    } catch (error) {
      console.error(`❌ Sandbox execution failed:`, error.message);
      
      // EnhancedSandbox automatically contains the failure
      return {
        success: false,
        error: error.message,
        contained: true, // Failure was contained within sandbox
        sandboxStats: sandbox.getStats()
      };
      
    } finally {
      // Automatic cleanup happens via timeout
      // Manual cleanup also available if needed
      await sandbox.cleanup();
    }
  }

  /**
   * Example: Plugin system with isolation
   * Demonstrates how plugins can be safely loaded and executed
   */
  async loadAndExecutePlugin(pluginCode, pluginId) {
    console.log(`Loading plugin: ${pluginId}`);
    
    const sandbox = new EnhancedSandbox({
      isolationLevel: 'strict',
      cleanupTimeout: 8000,
      resourceLimits: {
        memoryMB: 512,
        cpuPercent: 40,
        networkAccess: false,
        filesystemAccess: 'none' // Plugins shouldn't access filesystem
      }
    });
    
    try {
      // Define plugin API inside sandbox
      const pluginResult = await sandbox.run(() => {
        // Create isolated plugin context
        const pluginContext = {
          console: {
            log: (...args) => {
              // Limited console access
              console.log(`[Plugin ${pluginId}]:`, ...args);
            }
          },
          Math: Math, // Only safe built-ins
          Date: Date,
          JSON: JSON
        };
        
        // Execute plugin in isolated context
        const pluginFn = new Function('context', `
          with (context) {
            ${pluginCode}
          }
        `);
        
        return pluginFn(pluginContext);
      });
      
      console.log(`✅ Plugin ${pluginId} executed successfully`);
      return {
        pluginId,
        success: true,
        result: pluginResult,
        isolationLevel: 'strict'
      };
      
    } catch (error) {
      console.error(`❌ Plugin ${pluginId} failed:`, error.message);
      return {
        pluginId,
        success: false,
        error: error.message,
        contained: true // Failure contained
      };
    }
  }

  /**
   * Example: Data processing pipeline with isolation layers
   */
  async processSensitiveData(data, processingSteps) {
    console.log('Processing sensitive data with isolation layers');
    
    const results = [];
    const isolationLayers = ['lenient', 'moderate', 'strict'];
    
    for (let i = 0; i < processingSteps.length; i++) {
      const step = processingSteps[i];
      const isolationLevel = isolationLayers[Math.min(i, isolationLayers.length - 1)];
      
      console.log(`Step ${i + 1}: ${step.name} (${isolationLevel} isolation)`);
      
      const sandbox = new EnhancedSandbox(
        this.sandboxConfigs[isolationLevel]
      );
      
      try {
        const stepResult = await sandbox.run(() => {
          // Each step runs in its own isolated environment
          return step.processor(data);
        });
        
        results.push({
          step: step.name,
          success: true,
          result: stepResult,
          isolationLevel
        });
        
        // Pass result to next step
        if (stepResult) {
          data = { ...data, ...stepResult };
        }
        
      } catch (error) {
        console.error(`Step ${step.name} failed:`, error.message);
        results.push({
          step: step.name,
          success: false,
          error: error.message,
          isolationLevel,
          contained: true
        });
        
        // Failure doesn't propagate - sandbox contains it
        break;
      }
    }
    
    return {
      processed: results.filter(r => r.success),
      failed: results.filter(r => !r.success),
      finalData: data
    };
  }

  /**
   * Example: Parallel execution with resource limits
   */
  async parallelProcessing(tasks, maxConcurrent = 3) {
    console.log(`Running ${tasks.length} tasks with ${maxConcurrent} concurrent sandboxes`);
    
    const results = [];
    const activeSandboxes = new Map();
    
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      
      // Create sandboxes for batch
      const batchPromises = batch.map((task, index) => {
        const taskId = `task-${i + index}`;
        const sandbox = new EnhancedSandbox({
          isolationLevel: 'moderate',
          cleanupTimeout: 10000,
          resourceLimits: {
            memoryMB: 256,
            cpuPercent: 25
          }
        });
        
        activeSandboxes.set(taskId, sandbox);
        
        return sandbox.run(() => task.fn())
          .then(result => ({
            taskId,
            success: true,
            result,
            sandboxId: sandbox.id
          }))
          .catch(error => ({
            taskId,
            success: false,
            error: error.message,
            sandboxId: sandbox.id,
            contained: true
          }))
          .finally(() => {
            activeSandboxes.delete(taskId);
          });
      });
      
      // Wait for batch completion
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      console.log(`Completed batch ${Math.floor(i / maxConcurrent) + 1}`);
    }
    
    return results;
  }

  /**
   * Example: Resource monitoring and adaptive isolation
   */
  async adaptiveIsolation(taskFn, resourceConstraints) {
    console.log('Adaptive isolation based on resource constraints');
    
    // Determine isolation level based on constraints
    let isolationLevel = 'moderate';
    if (resourceConstraints.sensitivity === 'high') {
      isolationLevel = 'strict';
    } else if (resourceConstraints.risk === 'low') {
      isolationLevel = 'lenient';
    }
    
    // Adjust based on available resources
    const systemResources = await this.checkSystemResources();
    if (systemResources.memoryFree < 1024) { // Less than 1GB free
      isolationLevel = 'strict'; // Use strict to prevent memory exhaustion
    }
    
    console.log(`Selected isolation level: ${isolationLevel}`);
    
    const sandbox = new EnhancedSandbox(
      this.sandboxConfigs[isolationLevel]
    );
    
    return sandbox.run(taskFn);
  }

  // Mock implementations
  async checkSystemResources() {
    return {
      memoryFree: 2048, // 2GB
      cpuIdle: 70, // 70% idle
      diskFree: 50000 // 50GB
    };
  }
}

/**
 * Usage Examples
 */
async function demonstrateEnhancedSandbox() {
  console.log('=== EnhancedSandbox Pattern Demonstration ===\n');
  
  const workflow = new IsolatedWorkflow();
  
  // Example 1: Untrusted code execution
  console.log('1. Executing untrusted JavaScript code:');
  const untrustedCode = `
    // Attempt to access system resources
    try {
      const fs = require('fs');
      return "Should fail - no filesystem access";
    } catch (e) {
      return "Safe - filesystem access blocked: " + e.message;
    }
  `;
  
  const untrustedResult = await workflow.executeUntrustedCode(
    untrustedCode,
    {},
    'strict'
  );
  console.log('Result:', untrustedResult.success ? '✅ Contained' : '❌ Failed');
  console.log('Sandbox stats:', untrustedResult.sandboxStats);
  
  // Example 2: Plugin system
  console.log('\n2. Loading and executing a plugin:');
  const pluginCode = `
    // Plugin functionality
    function processData(data) {
      return {
        processed: true,
        timestamp: new Date().toISOString(),
        dataLength: data.length || 0
      };
    }
    
    // Return plugin API
    return {
      process: processData
    };
  `;
  
  const pluginResult = await workflow.loadAndExecutePlugin(
    pluginCode,
    'data-processor-v1'
  );
  console.log('Plugin result:', pluginResult.success ? '✅ Loaded' : '❌ Failed');
  
  // Example 3: Data processing pipeline
  console.log('\n3. Sensitive data processing pipeline:');
  const sensitiveData = { 
    users: ['user1', 'user2', 'user3'],
    sensitiveField: 'confidential'
  };
  
  const processingSteps = [
    {
      name: 'validation',
      processor: (data) => {
        // Validate data format
        if (!data.users || !Array.isArray(data.users)) {
          throw new Error('Invalid data format');
        }
        return { validated: true, userCount: data.users.length };
      }
    },
    {
      name: 'anonymization',
      processor: (data) => {
        // Anonymize sensitive data
        const anonymized = { ...data };
        delete anonymized.sensitiveField;
        anonymized.users = anonymized.users.map((_, i) => `user_${i}`);
        return { anonymized: true };
      }
    },
    {
      name: 'aggregation',
      processor: (data) => {
        // Aggregate data
        return {
          aggregated: true,
          totalUsers: data.users.length,
          timestamp: new Date().toISOString()
        };
      }
    }
  ];
  
  const pipelineResult = await workflow.processSensitiveData(
    sensitiveData,
    processingSteps
  );
  console.log('Pipeline results:');
  console.log('- Processed:', pipelineResult.processed.length);
  console.log('- Failed:', pipelineResult.failed.length);
  
  // Example 4: Parallel processing
  console.log('\n4. Parallel task execution with resource limits:');
  const tasks = Array.from({ length: 6 }, (_, i) => ({
    fn: () => {
      // Simulate work
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Busy wait
      }
      return `Task ${i + 1} completed`;
    }
  }));
  
  const parallelResults = await workflow.parallelProcessing(tasks, 2);
  console.log('Parallel results:');
  console.log('- Successful:', parallelResults.filter(r => r.success).length);
  console.log('- Failed:', parallelResults.filter(r => !r.success).length);
  
  // Example 5: Adaptive isolation
  console.log('\n5. Adaptive isolation based on constraints:');
  const adaptiveResult = await workflow.adaptiveIsolation(
    () => 'Adaptive task completed',
    { sensitivity: 'high', risk: 'medium' }
  );
  console.log('Adaptive result:', adaptiveResult);
  
  console.log('\n=== Demonstration Complete ===');
}

// Run demonstration
if (require.main === module) {
  demonstrateEnhancedSandbox().catch(console.error);
}

module.exports = { IsolatedWorkflow, demonstrateEnhancedSandbox };