// Browser stub for process module
export const env = {
  NODE_ENV: import.meta.env.MODE || 'development',
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL,
  // Add other environment variables as needed
  SLACK_WEBHOOK_URL: import.meta.env.VITE_SLACK_WEBHOOK_URL,
  SLACK_CHANNEL: import.meta.env.VITE_SLACK_CHANNEL,
  SLACK_USERNAME: import.meta.env.VITE_SLACK_USERNAME,
  SMTP_HOST: import.meta.env.VITE_SMTP_HOST,
  SMTP_PORT: import.meta.env.VITE_SMTP_PORT,
  SMTP_USER: import.meta.env.VITE_SMTP_USER,
  SMTP_PASSWORD: import.meta.env.VITE_SMTP_PASSWORD,
  ALERT_FROM_EMAIL: import.meta.env.VITE_ALERT_FROM_EMAIL,
  ALERT_TO_EMAILS: import.meta.env.VITE_ALERT_TO_EMAILS,
  PAGERDUTY_INTEGRATION_KEY: import.meta.env.VITE_PAGERDUTY_INTEGRATION_KEY,
  PAGERDUTY_SERVICE_KEY: import.meta.env.VITE_PAGERDUTY_SERVICE_KEY,
  ALERT_WEBHOOK_URL: import.meta.env.VITE_ALERT_WEBHOOK_URL,
  ALERT_WEBHOOK_HEADERS: import.meta.env.VITE_ALERT_WEBHOOK_HEADERS,
  MAX_ALERTS: import.meta.env.VITE_MAX_ALERTS,
  DEFAULT_COOLDOWN_MS: import.meta.env.VITE_DEFAULT_COOLDOWN_MS,
  CORRELATION_WINDOW_MS: import.meta.env.VITE_CORRELATION_WINDOW_MS,
  MIN_CORRELATION_CONFIDENCE: import.meta.env.VITE_MIN_CORRELATION_CONFIDENCE,
  ENABLE_SMART_GROUPING: import.meta.env.VITE_ENABLE_SMART_GROUPING,
  ENABLE_CASCADE_DETECTION: import.meta.env.VITE_ENABLE_CASCADE_DETECTION,
  AWS_REGION: import.meta.env.VITE_AWS_REGION,
  MONITORING_WEBHOOK_URL: import.meta.env.VITE_MONITORING_WEBHOOK_URL,
  ENCRYPTION_MASTER_SALT: import.meta.env.VITE_ENCRYPTION_MASTER_SALT,
  DATADOG_API_KEY: import.meta.env.VITE_DATADOG_API_KEY,
  NEW_SLACK_WEBHOOK_URL: import.meta.env.VITE_NEW_SLACK_WEBHOOK_URL,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
  VITE_NEWS_API_KEY: import.meta.env.VITE_NEWS_API_KEY,
  VITE_ERROR_TRACKING_ENDPOINT: import.meta.env.VITE_ERROR_TRACKING_ENDPOINT,
  VITE_ERROR_TRACKING_API_KEY: import.meta.env.VITE_ERROR_TRACKING_API_KEY,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  REACT_APP_VERSION: import.meta.env.VITE_APP_VERSION,
  // AI Provider environment variables
  // OpenAI configuration
  // Anthropic configuration
  // AI Failover configuration
};

export const cwd = () => '/';

export default {
  env,
  cwd
};