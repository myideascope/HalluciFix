---
name: Performance Regression
about: Automated issue for performance regressions
title: '[PERFORMANCE] Regression detected in {{metric_name}}'
labels: ['performance', 'regression', 'needs-investigation']
assignees: ''
---

## 📉 Performance Regression Detected

**Auto-generated issue for performance regression detected in CI/CD pipeline**

### **Regression Summary**
- **Metric**: {{metric_name}}
- **Current Value**: {{current_value}}
- **Baseline Value**: {{baseline_value}}
- **Regression**: {{regression_percentage}}% slower
- **Threshold**: {{threshold_value}}
- **Branch**: {{branch}}
- **Commit**: {{commit_sha}}
- **Workflow Run**: [{{workflow_run_id}}]({{workflow_run_url}})

### **Performance Metrics**
| Metric | Baseline | Current | Change | Status |
|--------|----------|---------|--------|--------|
{{performance_table}}

### **Affected Areas**
{{affected_components}}

### **Recent Changes**
{{recent_file_changes}}

### **Performance Analysis**
- **Bundle Size Change**: {{bundle_size_change}}
- **Test Execution Time**: {{test_execution_change}}
- **Memory Usage**: {{memory_usage_change}}
- **CPU Usage**: {{cpu_usage_change}}

### **Web Vitals Impact** (if applicable)
- **First Contentful Paint**: {{fcp_change}}
- **Largest Contentful Paint**: {{lcp_change}}
- **Cumulative Layout Shift**: {{cls_change}}
- **First Input Delay**: {{fid_change}}

### **Trend Analysis**
{{performance_trend_chart}}

### **Suggested Optimizations**
{{optimization_suggestions}}

### **Investigation Steps**
- [ ] Profile the affected code paths
- [ ] Analyze bundle composition changes
- [ ] Check for memory leaks
- [ ] Review database query performance
- [ ] Validate caching effectiveness

---

**Automated Actions Taken:**
- [x] Performance regression detected
- [x] Issue created automatically
- [ ] Performance alert sent to team
- [ ] Baseline updated (if approved)

**Manual Actions Required:**
- [ ] Investigate performance bottleneck
- [ ] Implement optimization fixes
- [ ] Validate performance improvement
- [ ] Update performance baselines if needed
- [ ] Close issue when resolved

---

*This issue was automatically created by the GitHub Actions performance monitoring system.*