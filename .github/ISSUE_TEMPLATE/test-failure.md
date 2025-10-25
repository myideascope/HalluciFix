---
name: Test Failure
about: Automated issue for test failures
title: '[TEST FAILURE] {{test_suite}} - {{failure_type}}'
labels: ['test-failure', 'needs-investigation', 'ci-cd']
assignees: ''
---

## 🔴 Test Failure Report

**Auto-generated issue for test failure detected in CI/CD pipeline**

### **Failure Summary**
- **Test Suite**: {{test_suite}}
- **Failure Type**: {{failure_type}}
- **Branch**: {{branch}}
- **Commit**: {{commit_sha}}
- **Workflow Run**: [{{workflow_run_id}}]({{workflow_run_url}})
- **Timestamp**: {{timestamp}}

### **Failed Tests**
{{failed_tests_list}}

### **Error Details**
```
{{error_message}}
```

### **Stack Trace**
```
{{stack_trace}}
```

### **Test Environment**
- **Runner**: {{runner_os}}
- **Node Version**: {{node_version}}
- **Test Framework**: {{test_framework}}
- **Browser** (if applicable): {{browser}}

### **Coverage Impact**
- **Previous Coverage**: {{previous_coverage}}%
- **Current Coverage**: {{current_coverage}}%
- **Coverage Change**: {{coverage_change}}%

### **Recent Changes**
{{recent_file_changes}}

### **Failure Pattern Analysis**
- **First Occurrence**: {{first_failure_date}}
- **Failure Frequency**: {{failure_count}} out of {{total_runs}} runs
- **Flaky Test**: {{is_flaky}}

### **Suggested Actions**
{{suggested_actions}}

### **Related Issues**
{{related_issues}}

---

**Automated Actions Taken:**
- [x] Issue created automatically
- [ ] Test marked as flaky (if applicable)
- [ ] Notification sent to team
- [ ] Code owners notified

**Manual Actions Required:**
- [ ] Investigate root cause
- [ ] Fix failing test or code
- [ ] Update test if requirements changed
- [ ] Close issue when resolved

---

*This issue was automatically created by the GitHub Actions test failure detection system.*