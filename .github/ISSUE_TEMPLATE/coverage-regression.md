---
name: Coverage Regression
about: Automated issue for test coverage regressions
title: '[COVERAGE] Coverage dropped below threshold'
labels: ['coverage', 'regression', 'test-quality']
assignees: ''
---

## 📊 Test Coverage Regression

**Auto-generated issue for test coverage regression detected in CI/CD pipeline**

### **Coverage Summary**
- **Global Coverage**: {{global_coverage}}% (was {{previous_coverage}}%)
- **Coverage Drop**: {{coverage_drop}}%
- **Threshold**: {{coverage_threshold}}%
- **Status**: {{coverage_status}}
- **Branch**: {{branch}}
- **Commit**: {{commit_sha}}
- **Workflow Run**: [{{workflow_run_id}}]({{workflow_run_url}})

### **Coverage Breakdown**
| Type | Current | Previous | Change | Threshold | Status |
|------|---------|----------|--------|-----------|--------|
| Lines | {{lines_coverage}}% | {{prev_lines}}% | {{lines_change}}% | {{lines_threshold}}% | {{lines_status}} |
| Functions | {{functions_coverage}}% | {{prev_functions}}% | {{functions_change}}% | {{functions_threshold}}% | {{functions_status}} |
| Branches | {{branches_coverage}}% | {{prev_branches}}% | {{branches_change}}% | {{branches_threshold}}% | {{branches_status}} |
| Statements | {{statements_coverage}}% | {{prev_statements}}% | {{statements_change}}% | {{statements_threshold}}% | {{statements_status}} |

### **Affected Modules**
{{affected_modules_table}}

### **Uncovered Code**
{{uncovered_code_sections}}

### **Recent Changes**
{{recent_file_changes}}

### **Missing Test Coverage**
{{missing_coverage_details}}

### **Critical Modules Status**
{{critical_modules_coverage}}

### **Coverage Trend**
{{coverage_trend_analysis}}

### **Recommended Actions**
- [ ] Add unit tests for uncovered functions
- [ ] Increase integration test coverage
- [ ] Add edge case testing
- [ ] Review test quality and effectiveness
- [ ] Consider removing dead code

### **Test Suggestions**
{{test_suggestions}}

---

**Automated Actions Taken:**
- [x] Coverage regression detected
- [x] Issue created automatically
- [ ] Coverage report generated
- [ ] Team notified of regression

**Manual Actions Required:**
- [ ] Review uncovered code sections
- [ ] Write additional tests
- [ ] Improve existing test quality
- [ ] Remove dead/unreachable code
- [ ] Close issue when coverage restored

---

*This issue was automatically created by the GitHub Actions coverage monitoring system.*