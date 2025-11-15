// src/processing/pipeline.ts
/**
 * Pipeline orchestration for the processing module.
 */

import { BaseComponent, generateUUID, getTimestamp } from '../core/base.js';
import { ComponentType, Status } from '../core/types.js';
import { ProcessingException, TimeoutException } from '../core/exceptions.js';
import type {
  IPipeline,
  PipelineConfig,
  PipelineStep,
  IProcessor,
  ITransformer,
  IAggregator,
  RetryConfig,
  ProcessingResult,
  ProcessingMetrics
} from './types.js';
import type { UUID, Timestamp, AsyncResult, Predicate } from '../types.js';
import { EventEmitter } from 'events';

/**
 * Pipeline execution context
 */
export class PipelineContext {
  public readonly id: UUID;
  public readonly startTime: Timestamp;
  public endTime?: Timestamp;
  public currentStep?: PipelineStep;
  public stepResults: Map<UUID, unknown> = new Map();
  public errors: Error[] = [];
  public metadata: Map<string, unknown> = new Map();

  constructor() {
    this.id = generateUUID();
    this.startTime = getTimestamp();
  }

  public setStepResult(stepId: UUID, result: unknown): void {
    this.stepResults.set(stepId, result);
  }

  public getStepResult(stepId: UUID): unknown {
    return this.stepResults.get(stepId);
  }

  public setMetadata(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  public getMetadata(key: string): unknown {
    return this.metadata.get(key);
  }

  public complete(): void {
    this.endTime = getTimestamp();
  }

  public get elapsedTime(): number {
    const end = this.endTime || getTimestamp();
    return Number(end) - Number(this.startTime);
  }
}

/**
 * Pipeline implementation
 */
export class Pipeline extends BaseComponent implements IPipeline {
  private config: PipelineConfig;
  private steps: Map<UUID, PipelineStep> = new Map();
  private stepOrder: UUID[] = [];
  private context?: PipelineContext;

  constructor(config: PipelineConfig) {
    super(config.name, ComponentType.PROCESSOR);
    this.config = config;
    
    // Add initial steps
    if (config.steps) {
      for (const step of config.steps) {
        this.addStep(step);
      }
    }
  }

  public addStep(step: PipelineStep): IPipeline {
    if (!step.id) {
      step.id = generateUUID();
    }
    
    this.steps.set(step.id, step);
    this.stepOrder.push(step.id);
    
    this.logger.debug(`Added step '${step.name}' to pipeline`);
    return this;
  }

  public removeStep(stepId: UUID): IPipeline {
    if (this.steps.delete(stepId)) {
      const index = this.stepOrder.indexOf(stepId);
      if (index > -1) {
        this.stepOrder.splice(index, 1);
      }
      this.logger.debug(`Removed step ${stepId} from pipeline`);
    }
    
    return this;
  }

  public insertStep(index: number, step: PipelineStep): IPipeline {
    if (!step.id) {
      step.id = generateUUID();
    }
    
    this.steps.set(step.id, step);
    this.stepOrder.splice(index, 0, step.id);
    
    this.logger.debug(`Inserted step '${step.name}' at position ${index}`);
    return this;
  }

  public async execute<T, R>(input: T): Promise<R> {
    this.context = new PipelineContext();
    this.setStatus(Status.RUNNING);
    
    try {
      let result: any = input;
      
      // Execute steps in order
      for (const stepId of this.stepOrder) {
        const step = this.steps.get(stepId);
        if (!step) continue;
        
        this.context.currentStep = step;
        
        // Check condition
        if (step.condition && !step.condition(result)) {
          this.logger.debug(`Skipping step '${step.name}' due to condition`);
          continue;
        }
        
        try {
          result = await this.executeStep(step, result);
          this.context.setStepResult(stepId, result);
          
          this.emitEvent('step:complete', {
            stepId,
            stepName: step.name,
            result
          });
        } catch (error) {
          if (!step.continueOnError && !this.handleStepError(step, error as Error)) {
            throw error;
          }
        }
      }
      
      this.context.complete();
      this.setStatus(Status.COMPLETED);
      
      return result as R;
      
    } catch (error) {
      this.context.errors.push(error as Error);
      this.context.complete();
      this.setStatus(Status.FAILED);
      throw new ProcessingException(
        `Pipeline execution failed: ${error}`,
        this.name
      );
    }
  }

  private async executeStep(step: PipelineStep, input: unknown): Promise<unknown> {
    this.logger.debug(`Executing step '${step.name}'`);
    
    // Apply timeout if specified
    const promise = this.executeStepLogic(step, input);
    
    if (step.timeout) {
      return this.withTimeout(promise, step.timeout, step.name);
    }
    
    return promise;
  }

  private async executeStepLogic(step: PipelineStep, input: unknown): Promise<unknown> {
    // Execute with retry if configured
    if (step.retryConfig) {
      return this.withRetry(
        () => this.runStep(step, input),
        step.retryConfig
      );
    }
    
    return this.runStep(step, input);
  }

  private async runStep(step: PipelineStep, input: unknown): Promise<unknown> {
    if (step.processor) {
      return step.processor.process(input);
    }
    
    if (step.transformer) {
      return step.transformer.transform(input);
    }
    
    if (step.aggregator) {
      if (Array.isArray(input)) {
        step.aggregator.addBatch(input);
      } else {
        step.aggregator.add(input);
      }
      return step.aggregator.getResult();
    }
    
    // Pass through if no processing logic
    return input;
  }

  private handleStepError(step: PipelineStep, error: Error): boolean {
    this.logger.error(`Error in step '${step.name}': ${error.message}`);
    
    if (step.errorHandler) {
      try {
        step.errorHandler(error);
        return true;
      } catch (handlerError) {
        this.logger.error(`Error handler failed: ${handlerError}`);
      }
    }
    
    if (this.config.stopOnError) {
      return false;
    }
    
    this.context?.errors.push(error);
    return true;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    stepName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new TimeoutException(
            `Step '${stepName}' timed out`,
            stepName,
            timeoutMs
          )),
          timeoutMs
        )
      )
    ]);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = config.delay;
    
    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < config.maxAttempts - 1) {
          this.logger.warn(`Retry attempt ${attempt + 1}/${config.maxAttempts}`);
          
          // Apply jitter if configured
          let waitTime = delay;
          if (config.jitter) {
            waitTime += Math.random() * delay * 0.1;
          }
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Update delay based on backoff strategy
          delay = this.calculateNextDelay(delay, attempt, config);
        }
      }
    }
    
    throw lastError;
  }

  private calculateNextDelay(
    currentDelay: number,
    attempt: number,
    config: RetryConfig
  ): number {
    let nextDelay = currentDelay;
    
    switch (config.backoff) {
      case 'exponential':
        nextDelay *= 2;
        break;
      case 'fibonacci':
        nextDelay = this.fibonacci(attempt + 2) * config.delay;
        break;
      case 'linear':
      default:
        nextDelay += config.delay;
        break;
    }
    
    if (config.maxDelay) {
      nextDelay = Math.min(nextDelay, config.maxDelay);
    }
    
    return nextDelay;
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  public validate(): boolean {
    if (this.stepOrder.length === 0) {
      this.logger.warn('Pipeline has no steps');
      return false;
    }
    
    for (const stepId of this.stepOrder) {
      const step = this.steps.get(stepId);
      if (!step) {
        this.logger.error(`Step ${stepId} not found`);
        return false;
      }
      
      if (!step.processor && !step.transformer && !step.aggregator) {
        this.logger.warn(`Step '${step.name}' has no processing logic`);
      }
    }
    
    return true;
  }

  public toJSON(): PipelineConfig {
    return {
      ...this.config,
      steps: Array.from(this.steps.values())
    };
  }

  public async initialize(): Promise<void> {
    this.logger.info(`Initializing pipeline: ${this.name}`);
    
    // Initialize all processors
    for (const step of this.steps.values()) {
      if (step.processor) {
        await step.processor.initialize();
      }
    }
  }

  public async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up pipeline: ${this.name}`);
    
    // Cleanup all processors
    for (const step of this.steps.values()) {
      if (step.processor) {
        await step.processor.cleanup();
      }
    }
  }

  public getContext(): PipelineContext | undefined {
    return this.context;
  }

  public getSteps(): PipelineStep[] {
    return this.stepOrder.map(id => this.steps.get(id)!);
  }

  public getStep(stepId: UUID): PipelineStep | undefined {
    return this.steps.get(stepId);
  }

  public getStepByName(name: string): PipelineStep | undefined {
    for (const step of this.steps.values()) {
      if (step.name === name) {
        return step;
      }
    }
    return undefined;
  }
}

/**
 * Parallel pipeline - executes steps in parallel
 */
export class ParallelPipeline extends Pipeline {
  constructor(config: PipelineConfig) {
    super({ ...config, parallel: true });
  }

  public async execute<T, R>(input: T): Promise<R> {
    this.context = new PipelineContext();
    this.setStatus(Status.RUNNING);
    
    try {
      const promises: Promise<unknown>[] = [];
      
      // Execute all steps in parallel
      for (const stepId of this.stepOrder) {
        const step = this.steps.get(stepId);
        if (!step) continue;
        
        if (step.condition && !step.condition(input)) {
          continue;
        }
        
        promises.push(this.executeStepAsync(step, input, stepId));
      }
      
      const results = await Promise.all(promises);
      
      this.context.complete();
      this.setStatus(Status.COMPLETED);
      
      // Return array of results for parallel execution
      return results as any as R;
      
    } catch (error) {
      this.context.errors.push(error as Error);
      this.context.complete();
      this.setStatus(Status.FAILED);
      throw new ProcessingException(
        `Parallel pipeline execution failed: ${error}`,
        this.name
      );
    }
  }

  private async executeStepAsync(
    step: PipelineStep,
    input: unknown,
    stepId: UUID
  ): Promise<unknown> {
    try {
      const result = await this.executeStep(step, input);
      this.context?.setStepResult(stepId, result);
      
      this.emitEvent('step:complete', {
        stepId,
        stepName: step.name,
        result
      });
      
      return result;
    } catch (error) {
      if (!step.continueOnError && !this.handleStepError(step, error as Error)) {
        throw error;
      }
      return null;
    }
  }

  private async executeStep(step: PipelineStep, input: unknown): Promise<unknown> {
    if (step.processor) {
      return step.processor.process(input);
    }
    
    if (step.transformer) {
      return step.transformer.transform(input);
    }
    
    if (step.aggregator) {
      if (Array.isArray(input)) {
        step.aggregator.addBatch(input);
      } else {
        step.aggregator.add(input);
      }
      return step.aggregator.getResult();
    }
    
    return input;
  }

  private handleStepError(step: PipelineStep, error: Error): boolean {
    this.logger.error(`Error in parallel step '${step.name}': ${error.message}`);
    
    if (step.errorHandler) {
      try {
        step.errorHandler(error);
        return true;
      } catch (handlerError) {
        this.logger.error(`Error handler failed: ${handlerError}`);
      }
    }
    
    this.context?.errors.push(error);
    return !this.config.stopOnError;
  }
}

/**
 * Pipeline builder for fluent API
 */
export class PipelineBuilder {
  private config: PipelineConfig;
  private steps: PipelineStep[] = [];

  constructor(name: string) {
    this.config = {
      name,
      steps: []
    };
  }

  public addProcessor(
    name: string,
    processor: IProcessor,
    options?: Partial<PipelineStep>
  ): PipelineBuilder {
    this.steps.push({
      id: generateUUID(),
      name,
      processor,
      ...options
    });
    return this;
  }

  public addTransformer(
    name: string,
    transformer: ITransformer,
    options?: Partial<PipelineStep>
  ): PipelineBuilder {
    this.steps.push({
      id: generateUUID(),
      name,
      transformer,
      ...options
    });
    return this;
  }

  public addAggregator(
    name: string,
    aggregator: IAggregator,
    options?: Partial<PipelineStep>
  ): PipelineBuilder {
    this.steps.push({
      id: generateUUID(),
      name,
      aggregator,
      ...options
    });
    return this;
  }

  public withCondition(condition: Predicate<unknown>): PipelineBuilder {
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1]!.condition = condition;
    }
    return this;
  }

  public withRetry(config: RetryConfig): PipelineBuilder {
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1]!.retryConfig = config;
    }
    return this;
  }

  public withTimeout(timeout: number): PipelineBuilder {
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1]!.timeout = timeout;
    }
    return this;
  }

  public withErrorHandler(handler: (error: Error) => void): PipelineBuilder {
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1]!.errorHandler = handler;
    }
    return this;
  }

  public parallel(enabled = true): PipelineBuilder {
    this.config.parallel = enabled;
    return this;
  }

  public stopOnError(enabled = true): PipelineBuilder {
    this.config.stopOnError = enabled;
    return this;
  }

  public maxConcurrency(max: number): PipelineBuilder {
    this.config.maxConcurrency = max;
    return this;
  }

  public enableCheckpoints(enabled = true): PipelineBuilder {
    this.config.checkpoints = enabled;
    return this;
  }

  public build(): IPipeline {
    this.config.steps = this.steps;
    
    if (this.config.parallel) {
      return new ParallelPipeline(this.config);
    }
    
    return new Pipeline(this.config);
  }
}

/**
 * Create a simple pipeline from functions
 */
export function createPipeline(
  name: string,
  ...steps: Array<(input: unknown) => unknown | Promise<unknown>>
): IPipeline {
  const builder = new PipelineBuilder(name);
  
  for (let i = 0; i < steps.length; i++) {
    const stepFn = steps[i]!;
    builder.addTransformer(
      `Step ${i + 1}`,
      {
        name: `Step ${i + 1}`,
        type: TransformerType.MAP,
        transform: stepFn,
        canTransform: () => true
      } as ITransformer
    );
  }
  
  return builder.build();
}

// Import TransformerType for convenience
import { TransformerType } from './types.js';