/**
 * Cross-Browser Testing Utilities
 * Provides utilities for testing across different browsers and devices
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { injectAxe, checkA11y, getViolations } from '@axe-core/playwright';

export interface BrowserTestConfig {
  browserName: 'chro