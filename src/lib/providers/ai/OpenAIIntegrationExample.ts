/**
 * OpenAI Integration Example
 * Demonstrates how to use the OpenAI provider with all features
 */

import { OpenAIProvider, OpenAIConfig } from './index';

import { logger } from './logging';
/**
 * Example of how to initialize and use the OpenAI provider
 */
export async function demonstrateOpenAIIntegration() {
  // Load configuration from environment
  const config = OpenAIConfig.loadFromEnvironment();
  
  if (!config) {
    logger.debug("OpenAI not configured. Please set VITE_OPENAI_API_KEY in your environment.");
    return;
  }

  // Validate configuration
  const validation = OpenAIConfig.validateConfig(config);
  if (!validation.isValid) {
    logger.error("Invalid OpenAI configuration:", validation.errors instanceof Error ? validation.errors : new Error(String(validation.errors)));
    return;
  }

  // Create provider instance
  const provider = new OpenAIProvider(config);

  try {
    // Test credentials
    const isValid = await provider.validateCredentials();
    if (!isValid) {
      logger.error("Invalid OpenAI credentials");
      return;
    }

    logger.debug("OpenAI provider initialized successfully");

    // Example content analysis
    const testContent = `
      Our revolutionary AI system achieves 99.9% accuracy in all tasks, 
      with zero false positives and unprecedented performance that is 
      exactly 1000 times faster than any competitor.
    `;

    logger.debug("Analyzing test content...");
    
    const result = await provider.analyzeContent(testContent, {
      sensitivity: 'high',
      includeSourceVerification: true,
      maxHallucinations: 5
    });

    logger.info("Analysis Result:", { {
      accuracy: result.accuracy,
      riskLevel: result.riskLevel,
      hallucinationCount: result.hallucinations.length,
      processingTime: result.processingTime
    } });

    // Display hallucinations found
    if (result.hallucinations.length > 0) {
      logger.debug("Hallucinations detected:");
      result.hallucinations.forEach((h, index) => {
        console.log(`${index + 1}. ${h.type}: "${h.text}" - ${h.explanation}`);
      });
    }

    // Show usage metrics
    const usage = provider.getUsageMetrics();
    logger.info("Usage Metrics:", { {
      totalRequests: usage.requests.total,
      totalTokens: usage.tokens.total,
      totalCost: usage.costs.total.toFixed(4 })
    });

    // Show quota status
    const quotas = provider.getQuotaStatus();
    logger.info("Quota Status:", { {
      requestsHourly: `${quotas.requests.hourly.used}/${quotas.requests.hourly.limit}`,
      tokensHourly: `${quotas.tokens.hourly.used}/${quotas.tokens.hourly.limit}`,
      costsHourly: `$${quotas.costs.hourly.used.toFixed(4 })}/$${quotas.costs.hourly.limit}`
    });

    // Show any warnings
    if (quotas.warnings.length > 0) {
      logger.warn("Quota Warnings:", { quotas.warnings });
    }

  } catch (error) {
    logger.error("Error during OpenAI integration test:", error instanceof Error ? error : new Error(String(error)));
    
    // Show error metrics
    const errorMetrics = provider.getErrorMetrics();
    logger.info("Error Metrics:", { {
      circuitBreakerState: errorMetrics.circuitBreaker.state,
      recentErrorCount: errorMetrics.recentErrors.length,
      performanceMetrics: errorMetrics.performance
    } });
  }
}

/**
 * Example of batch processing with the OpenAI provider
 */
export async function demonstrateBatchProcessing() {
  const config = OpenAIConfig.loadFromEnvironment();
  if (!config) return;

  const provider = new OpenAIProvider(config);

  const testContents = [
    "This product has a perfect 100% success rate with zero complaints ever.",
    "Studies show that our method is revolutionary and unprecedented in the industry.",
    "The weather today is sunny with a temperature of 75°F."
  ];

  logger.info("Processing batch of content...");

  const results = await Promise.allSettled(
    testContents.map((content, index) => 
      provider.analyzeContent(content, { sensitivity: 'medium' })
        .then(result => ({ index, content: content.substring(0, 50) + '...', result }))
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { content, result: analysis } = result.value;
      console.log(`Content ${index + 1}: "${content}" - Accuracy: ${analysis.accuracy}%, Risk: ${analysis.riskLevel}`);
    } else {
      console.error(`Content ${index + 1} failed:`, result.reason.message);
    }
  });

  // Show final usage metrics
  const usage = provider.getUsageMetrics();
  logger.info("Final Usage:", { {
    requests: usage.requests.total,
    tokens: usage.tokens.total,
    cost: `$${usage.costs.total.toFixed(4 })}`
  });
}

// Export for easy testing
export { OpenAIProvider, OpenAIConfig };