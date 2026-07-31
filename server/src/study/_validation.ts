// Validation layer for study content generation
import { logger } from '../util/logger.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics?: {
    wordCount?: number;
    sectionCount?: number;
    exampleCount?: number;
    questionCount?: number;
  };
}

/**
 * Count words in text content
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Validate word count is within range
 */
export function validateWordCount(
  content: string,
  min: number,
  max: number,
  label: string = 'Content'
): ValidationResult {
  const wordCount = countWords(content);
  const valid = wordCount >= min && wordCount <= max;
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (wordCount < min) {
    errors.push(`${label} too short: ${wordCount} words (minimum ${min})`);
  } else if (wordCount > max) {
    warnings.push(`${label} too long: ${wordCount} words (maximum ${max})`);
  }
  
  return {
    valid,
    errors,
    warnings,
    metrics: { wordCount }
  };
}

/**
 * Validate structure has required fields
 */
export function validateStructure(
  content: any,
  requiredFields: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const field of requiredFields) {
    if (!(field in content)) {
      errors.push(`Missing required field: ${field}`);
    } else if (!content[field]) {
      warnings.push(`Empty field: ${field}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate 5-mark answer quality
 * Requirements: 400-550 words, subtopics, examples, key points
 */
export function validateNotes5Mark(qa: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalWordCount = 0;
  
  if (!qa.question) {
    errors.push('Missing question');
  }
  
  if (!qa.answer) {
    errors.push('Missing answer');
  } else {
    const wordCount = countWords(qa.answer);
    totalWordCount = wordCount;
    
    if (wordCount < 400) {
      errors.push(`Answer too short: ${wordCount} words (minimum 400)`);
    } else if (wordCount < 450) {
      warnings.push(`Answer slightly short: ${wordCount} words (recommended 450-550)`);
    } else if (wordCount > 600) {
      warnings.push(`Answer very long: ${wordCount} words (recommended 400-550)`);
    }
  }
  
  // Check for required components
  if (!qa.subtopics || qa.subtopics.length < 3) {
    warnings.push('Should have at least 3-4 subtopics');
  }
  
  if (!qa.examples || qa.examples.length < 2) {
    warnings.push('Should have at least 2 examples');
  }
  
  if (!qa.keyPoints || qa.keyPoints.length < 4) {
    warnings.push('Should have at least 4 key points');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { wordCount: totalWordCount }
  };
}

/**
 * Validate 10-mark answer quality
 * Requirements: 800-1200 words, introduction, detailed subtopics, conclusion, diagrams
 */
export function validateNotes10Mark(qa: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalWordCount = 0;
  
  if (!qa.question) {
    errors.push('Missing question');
  }
  
  if (!qa.answer) {
    errors.push('Missing answer');
  } else {
    const wordCount = countWords(qa.answer);
    totalWordCount = wordCount;
    
    if (wordCount < 800) {
      errors.push(`Answer too short: ${wordCount} words (minimum 800)`);
    } else if (wordCount < 900) {
      warnings.push(`Answer slightly short: ${wordCount} words (recommended 900-1200)`);
    } else if (wordCount > 1400) {
      warnings.push(`Answer very long: ${wordCount} words (recommended 800-1200)`);
    }
  }
  
  // Check for required components
  if (!qa.introduction) {
    warnings.push('Missing introduction section');
  }
  
  if (!qa.subtopics || qa.subtopics.length < 4) {
    warnings.push('Should have at least 4-6 subtopics');
  }
  
  if (!qa.conclusion) {
    warnings.push('Missing conclusion section');
  }
  
  if (!qa.diagrams || qa.diagrams.length === 0) {
    warnings.push('Should have at least 1-2 diagrams');
  }
  
  if (!qa.examples || qa.examples.length < 3) {
    warnings.push('Should have at least 3-4 examples');
  }
  
  if (!qa.keyPoints || qa.keyPoints.length < 6) {
    warnings.push('Should have at least 6-8 key points');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { wordCount: totalWordCount }
  };
}

/**
 * Validate exam notes quality
 * Requirements: 800-1200 words, comprehensive structure
 */
export function validateExamNotes(content: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!content.examNotes) {
    errors.push('Missing examNotes field');
    return { valid: false, errors, warnings };
  }
  
  const wordCount = countWords(content.examNotes);
  
  if (wordCount < 800) {
    errors.push(`Exam notes too short: ${wordCount} words (minimum 800)`);
  } else if (wordCount < 900) {
    warnings.push(`Exam notes slightly short: ${wordCount} words (recommended 900-1200)`);
  } else if (wordCount > 1400) {
    warnings.push(`Exam notes very long: ${wordCount} words (recommended 800-1200)`);
  }
  
  if (!content.quickTips || content.quickTips.length < 5) {
    warnings.push('Should have at least 5 quick tips');
  }
  
  if (!content.diagrams || content.diagrams.length < 2) {
    warnings.push('Should have at least 2 diagrams');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { wordCount }
  };
}

/**
 * Validate short notes quality
 * Requirements: 3-5 distinct cards
 */
export function validateShortNotes(content: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!content.shortNotes || !Array.isArray(content.shortNotes)) {
    errors.push('Missing shortNotes array');
    return { valid: false, errors, warnings };
  }
  
  const cardCount = content.shortNotes.length;
  
  if (cardCount < 3) {
    errors.push(`Too few cards: ${cardCount} (minimum 3)`);
  } else if (cardCount < 4) {
    warnings.push(`Consider adding more cards: ${cardCount} (recommended 4-5)`);
  } else if (cardCount > 8) {
    warnings.push(`Too many cards: ${cardCount} (recommended 3-5 for "short" notes)`);
  }
  
  // Check each card has content
  content.shortNotes.forEach((card: string, i: number) => {
    const words = countWords(card);
    if (words < 30) {
      warnings.push(`Card ${i + 1} too short: ${words} words (recommended 50-150)`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { sectionCount: cardCount }
  };
}

/**
 * Validate one-page summary quality
 * Requirements: 900-1200 words, dense content
 */
export function validateOnePage(content: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!content.onePage) {
    errors.push('Missing onePage field');
    return { valid: false, errors, warnings };
  }
  
  const wordCount = countWords(content.onePage);
  
  if (wordCount < 900) {
    errors.push(`One-page summary too short: ${wordCount} words (minimum 900)`);
  } else if (wordCount < 1000) {
    warnings.push(`One-page summary slightly short: ${wordCount} words (recommended 1000-1200)`);
  } else if (wordCount > 1400) {
    warnings.push(`One-page summary too long: ${wordCount} words (maximum 1200 for "one-page")`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { wordCount }
  };
}

/**
 * Validate viva questions quality
 * Requirements: 6-10 questions with 80-150 word answers
 */
export function validateVivaQuestions(content: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!content.viva || !Array.isArray(content.viva)) {
    errors.push('Missing viva array');
    return { valid: false, errors, warnings };
  }
  
  const questionCount = content.viva.length;
  
  if (questionCount < 6) {
    errors.push(`Too few viva questions: ${questionCount} (minimum 6)`);
  } else if (questionCount < 8) {
    warnings.push(`Consider adding more questions: ${questionCount} (recommended 8-10)`);
  }
  
  content.viva.forEach((item: any, i: number) => {
    if (!item.question) {
      errors.push(`Viva item ${i + 1} missing question`);
    }
    if (!item.expectedAnswer) {
      errors.push(`Viva item ${i + 1} missing expectedAnswer`);
    } else {
      const words = countWords(item.expectedAnswer);
      if (words < 60) {
        warnings.push(`Viva ${i + 1} answer too short: ${words} words (recommended 80-150)`);
      } else if (words > 200) {
        warnings.push(`Viva ${i + 1} answer too long: ${words} words (recommended 80-150)`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { questionCount }
  };
}

/**
 * Retry a generation with feedback if validation fails
 */
export async function retryWithFeedback<T>(
  generator: () => Promise<T>,
  validator: (result: T) => ValidationResult,
  maxRetries: number = 2
): Promise<{ result: T; validation: ValidationResult; retries: number }> {
  let retries = 0;
  
  while (retries <= maxRetries) {
    const result = await generator();
    const validation = validator(result);
    
    if (validation.valid) {
      if (validation.warnings.length > 0) {
        logger.warn('Validation passed with warnings:', validation.warnings);
      }
      return { result, validation, retries };
    }
    
    if (retries < maxRetries) {
      logger.warn(`Validation failed (attempt ${retries + 1}/${maxRetries + 1}):`, validation.errors);
      retries++;
    } else {
      logger.error('Validation failed after max retries:', validation.errors);
      // Return result anyway but log the failure
      return { result, validation, retries };
    }
  }
  
  throw new Error('Unexpected retry loop exit');
}

/**
 * Log validation results
 */
export function logValidation(
  featureType: string,
  validation: ValidationResult,
  retries: number = 0
): void {
  const status = validation.valid ? '✓' : '✗';
  const retriesText = retries > 0 ? ` (${retries} retries)` : '';
  
  logger.info(`${status} ${featureType} validation${retriesText}`, {
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    metrics: validation.metrics
  });
}
