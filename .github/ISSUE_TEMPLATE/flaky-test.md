---
name: Flaky Test
about: Automated issue for flaky test detection
title: '[FLAKY TEST] {{test_name}} - Intermittent failures detected'
labels: ['flaky-test', 'test-stability', 'needs-investigation']
assignees: ''
---

## 🔄 Flaky Test Detected

**Auto-generated issue for flaky test behavior detected in CI/CD pipeline**

### **Test Information**
- **Test Name**: {{test_name}}
- **Test File**: {{test_file}}
- **Test Suite**: {{test_suite}}
- **Detection Date**: {{detection_date}}
- **Failure Rate**: {{failure_rate}}% ({{failures}} out of {{total_runs}} runs)

### **Failure Pattern**
- **First Failure**: {{first_failure_date}}
- **Recent Failures**: {{recent_failures_count}} in last {{time_period}}
- **Failure Frequency**: {{failure_frequency}}
- **Success Rate**: {{success_rate}}%

### **Recent Failure Details**
{{recent_failure_logs}}

### **Error Patterns**
{{error_patterns}}

### **Environment Correlation**
| Environment | Failure Rate | Notes |
|-------------|--------------|-------|
{{environment_correlation_table}}

### **Timing Analysis**
- **Average Execution Time**: {{avg_execution_time}}ms
- **Timeout Threshold**: {{timeout_threshold}}ms
- **Timing Variance**: {{timing_variance}}ms

### **Potential Causes**
{{potential_causes}}

### **Investigation Steps**
- [ ] Review test for race conditions
- [ ] Check for external dependencies
- [ ] Analyze timing-sensitive operations
- [ ] Verify test isolation
- [ ] Check for shared state issues
- [ ] Review async/await patterns

### **Stabilization Strategies**
- [ ] Add explicit waits/retries
- [ ] Improve test isolation
- [ ] Mock external dependencies
- [ ] Increase timeout values
- [ ] Add proper cleanup
- [ ] Use deterministic test data

### **Impact Assessment**
- **CI/CD Reliability**: {{cicd_impact}}
- **Developer Productivity**: {{dev_productivity_impact}}
- **Deployment Confidence**: {{deployment_confidence_impact}}

---

**Automated Actions Taken:**
- [x] Flaky test detected and flagged
- [x] Issue created automatically
- [ ] Test marked for quarantine
- [ ] Retry mechanism applied

**Manual Actions Required:**
- [ ] Investigate root cause of flakiness
- [ ] Implement stabilization fixes
- [ ] Validate test reliability
- [ ] Remove from flaky test list
- [ ] Close issue when stabilized

---

*This issue was automatically created by the GitHub Actions flaky test detection system.*