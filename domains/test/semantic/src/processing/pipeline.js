// processing/pipeline.js
/**
 * Processing pipeline management.
 * 
 * This module provides pipeline orchestration for complex
 * multi-step data processing workflows.
 */

import { EventEmitter } from 'events';
import { Status } from '../core/base.js';
import { PipelineError } from '../core/exceptions.js';

/**
 * Pipeline step
 */
export class PipelineStep {
    constructor(name, processor, options = {}) {
        this.name = name;
        this.processor = processor;
        this.options = options;
        this.retryCount = options.retryCount || 3;
        this.timeout = options.timeout || 30000;
        this.continueOnError = options.continueOnError || false;
        this.condition = options.condition || null;
        this.status = Status.PENDING;
        this.result = null;
        this.error = null;
    }

    async execute(input, context = {}) {
        this.status = Status.RUNNING;
        
        try {
            // Check condition
            if (this.condition && !await this.condition(input, context)) {
                this.status = Status.COMPLETED;
                this.result = input; // Pass through unchanged
                return input;
            }

            // Execute with timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Step timeout')), this.timeout)
            );

            const processPromise = this._executeWithRetry(input, context);
            
            this.result = await Promise.race([processPromise, timeoutPromise]);
            this.status = Status.COMPLETED;
            
            return this.result;

        } catch (error) {
            this.status = Status.FAILED;
            this.error = error;
            
            if (!this.continueOnError) {
                throw new PipelineError(
                    `Step '${this.name}' failed: ${error.message}`,
                    null,
                    null,
                    this.name
                );
            }
            
            return input; // Pass through on error if continuing
        }
    }

    async _executeWithRetry(input, context) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                if (typeof this.processor === 'function') {
                    return await this.processor(input, context);
                } else if (this.processor && this.processor.process) {
                    return await this.processor.process(input);
                } else {
                    throw new Error('Invalid processor');
                }
            } catch (error) {
                lastError = error;
                
                if (attempt < this.retryCount) {
                    await new Promise(resolve => 
                        setTimeout(resolve, Math.pow(2, attempt) * 1000)
                    );
                }
            }
        }
        
        throw lastError;
    }
}

/**
 * Processing pipeline
 */
export class Pipeline extends EventEmitter {
    constructor(name = 'pipeline', options = {}) {
        super();
        this.name = name;
        this.steps = [];
        this.context = {};
        this.status = Status.PENDING;
        this.options = options;
        this.parallelExecution = options.parallel || false;
        this.stopOnError = options.stopOnError ?? true;
    }

    /**
     * Add a step to the pipeline
     */
    addStep(name, processor, options = {}) {
        const step = new PipelineStep(name, processor, options);
        this.steps.push(step);
        return this;
    }

    /**
     * Insert a step at specific position
     */
    insertStep(index, name, processor, options = {}) {
        const step = new PipelineStep(name, processor, options);
        this.steps.splice(index, 0, step);
        return this;
    }

    /**
     * Remove a step by name
     */
    removeStep(name) {
        const index = this.steps.findIndex(s => s.name === name);
        if (index >= 0) {
            this.steps.splice(index, 1);
        }
        return this;
    }

    /**
     * Execute the pipeline
     */
    async execute(input, context = {}) {
        this.status = Status.RUNNING;
        this.context = { ...this.context, ...context };
        
        const startTime = Date.now();
        let data = input;
        const results = [];

        try {
            this.emit('pipelineStart', { input, context: this.context });

            if (this.parallelExecution) {
                data = await this._executeParallel(data, results);
            } else {
                data = await this._executeSequential(data, results);
            }

            const elapsedTime = (Date.now() - startTime) / 1000;
            
            this.status = Status.COMPLETED;
            this.emit('pipelineComplete', { 
                output: data, 
                results,
                elapsedTime 
            });

            return {
                output: data,
                steps: results,
                elapsedTime,
                status: this.status
            };

        } catch (error) {
            this.status = Status.FAILED;
            this.emit('pipelineError', error);
            throw error;
        }
    }

    /**
     * Execute steps sequentially
     */
    async _executeSequential(input, results) {
        let data = input;

        for (const step of this.steps) {
            this.emit('stepStart', { step: step.name, input: data });

            try {
                data = await step.execute(data, this.context);
                
                results.push({
                    name: step.name,
                    status: step.status,
                    result: step.result
                });

                this.emit('stepComplete', { 
                    step: step.name, 
                    output: data 
                });

            } catch (error) {
                results.push({
                    name: step.name,
                    status: step.status,
                    error: error.message
                });

                this.emit('stepError', { step: step.name, error });

                if (this.stopOnError) {
                    throw error;
                }
            }
        }

        return data;
    }

    /**
     * Execute steps in parallel
     */
    async _executeParallel(input, results) {
        const promises = this.steps.map(async step => {
            this.emit('stepStart', { step: step.name, input });

            try {
                const output = await step.execute(input, this.context);
                
                this.emit('stepComplete', { 
                    step: step.name, 
                    output 
                });

                return {
                    name: step.name,
                    status: step.status,
                    result: output
                };

            } catch (error) {
                this.emit('stepError', { step: step.name, error });

                if (this.stopOnError) {
                    throw error;
                }

                return {
                    name: step.name,
                    status: step.status,
                    error: error.message
                };
            }
        });

        const stepResults = await Promise.all(promises);
        results.push(...stepResults);

        // Return array of outputs for parallel execution
        return stepResults.map(r => r.result || input);
    }

    /**
     * Validate pipeline configuration
     */
    validate() {
        if (this.steps.length === 0) {
            throw new PipelineError('Pipeline has no steps');
        }

        for (const step of this.steps) {
            if (!step.processor) {
                throw new PipelineError(`Step '${step.name}' has no processor`);
            }
        }

        return true;
    }

    /**
     * Get pipeline configuration
     */
    toJSON() {
        return {
            name: this.name,
            steps: this.steps.map(s => ({
                name: s.name,
                status: s.status,
                options: s.options
            })),
            options: this.options,
            status: this.status
        };
    }

    /**
     * Create pipeline from configuration
     */
    static fromJSON(config, processorFactory) {
        const pipeline = new Pipeline(config.name, config.options);
        
        for (const stepConfig of config.steps) {
            const processor = processorFactory(stepConfig.processorType, stepConfig.processorConfig);
            pipeline.addStep(stepConfig.name, processor, stepConfig.options);
        }

        return pipeline;
    }
}

/**
 * Branching pipeline - conditional execution paths
 */
export class BranchingPipeline extends Pipeline {
    constructor(name = 'branching-pipeline', options = {}) {
        super(name, options);
        this.branches = new Map();
    }

    /**
     * Add a conditional branch
     */
    addBranch(condition, pipeline) {
        this.branches.set(condition, pipeline);
        return this;
    }

    /**
     * Execute with branching logic
     */
    async execute(input, context = {}) {
        // First execute main pipeline
        const mainResult = await super.execute(input, context);

        // Then check branches
        for (const [condition, branchPipeline] of this.branches) {
            if (await condition(mainResult.output, context)) {
                this.emit('branchTaken', { branch: branchPipeline.name });
                return await branchPipeline.execute(mainResult.output, context);
            }
        }

        return mainResult;
    }
}

/**
 * Loop pipeline - iterative execution
 */
export class LoopPipeline extends Pipeline {
    constructor(name = 'loop-pipeline', options = {}) {
        super(name, options);
        this.maxIterations = options.maxIterations || 100;
        this.continueCondition = options.continueCondition || (() => false);
    }

    /**
     * Execute with loop logic
     */
    async execute(input, context = {}) {
        let data = input;
        let iteration = 0;
        const results = [];

        while (iteration < this.maxIterations) {
            this.emit('iterationStart', { iteration, input: data });

            const result = await super.execute(data, context);
            results.push(result);
            data = result.output;

            if (!await this.continueCondition(data, iteration, context)) {
                break;
            }

            iteration++;
        }

        return {
            output: data,
            iterations: iteration + 1,
            results
        };
    }
}

/**
 * Create a simple pipeline from functions
 */
export function createPipeline(name, ...processors) {
    const pipeline = new Pipeline(name);
    
    processors.forEach((processor, index) => {
        const stepName = processor.name || `step_${index}`;
        pipeline.addStep(stepName, processor);
    });

    return pipeline;
}