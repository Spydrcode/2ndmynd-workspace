/**
 * RunContext - Explicit runtime context for analysis runs
 * Eliminates inference from INTELLIGENCE_MODE defaults
 */

export type LearningSource = "mock" | "real";

export type RunContext = {
  /**
   * Explicit learning data source - do not infer from environment
   * - "mock": Generated/test data (mockgen, internal testing)
   * - "real": Production data from actual workspace uploads
   */
  learning_source?: LearningSource;

  /**
   * Internal testing flag for non-production runs
   */
  internal_test?: boolean;
};
