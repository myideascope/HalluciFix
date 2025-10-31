# Repository Security Setup Guide

This guide provides step-by-step instructions for configuring GitHub repository security settings and branch protection rules for the HalluciFix project.

## Prerequisites

- Repository admin access
- GitHub organization with appropriate teams configured
- Understanding of the project's security requirements

## Step 1: Configure Repository Security Settings

### Enable Security Features

1. Navigate to **Settings** → **Security & analysis**
2. Enable the following features:

#### Vulnerability Alerts
- ✅ **Dependency graph**: Enable
- ✅ **Dependabot alerts**: Enable
- ✅ **Dependabot security updates**: Enable

#### Code Security and Analysis
- ✅ **Code scanning**: Enable CodeQL analysis
- ✅ **Secret scanning**: Enable
- ✅ **Secret scanning push protection**: Enable

### Configure Security Policies

1. Create security policy file (already created as `.github/security.md`)
2. Set up private vulnerability reporting
3. Configure security advisories

## Step 2: Set Up Branch Protection Rules

### Main Branch Protection

Navigate to **Settings** → **Branches** → **Add rule**

**Branch name pattern**: `main`

#### Pull Request Settings
- ✅ **Require a pull request before merging**
- ✅ **Require approvals**: 2
- ✅ **Dismiss stale pull request approvals when new commits are pushed**
- ✅ **Require review from code owners**
- ✅ **Restrict dismissals**: Configure for security team

#### Status Check Settings
- ✅ **Require status checks to pass before merging**
- ✅ **Require branches to be up to date before merging**
- **Required status checks**:
  - Unit Tests
  - Integration Tests
  - Security Scan
  - Coverage Check
  - Build
  - Lint

#### Additional Settings
- ✅ **Require conversation resolution before merging**
- ✅ **Require signed commits**
- ✅ **Include administrators**
- ❌ **Allow force pushes**
- ❌ **Allow deletions**

#### Push Restrictions
- **Restrict pushes that create matching branches**
- Add teams: `core-developers`

### Develop Branch Protection

**Branch name pattern**: `develop`

#### Pull Request Settings
- ✅ **Require a pull request before merging**
- ✅ **Require approvals**: 1
- ✅ **Dismiss stale pull request approvals when new commits are pushed**
- ❌ **Require review from code owners** (optional for develop)

#### Status Check Settings
- ✅ **Require status checks to pass before merging**
- ✅ **Require branches to be up to date before merging**
- **Required status checks**:
  - Unit Tests
  - Integration Tests
  - Build
  - Lint

#### Additional Settings
- ✅ **Require conversation resolution before merging**
- ❌ **Include administrators**
- ❌ **Allow force pushes**
- ❌ **Allow deletions**

#### Push Restrictions
- **Restrict pushes that create matching branches**
- Add teams: `developers`

## Step 3: Configure Code Owners

1. Create `.github/CODEOWNERS` file (already created)
2. Define code ownership patterns for different parts of the codebase
3. Ensure all critical paths have appropriate owners

## Step 4: Set Up Teams and Permissions

### Required Teams

Create the following teams in your GitHub organization:

#### Core Teams
- **core-developers**: Senior developers with full repository access
- **developers**: Regular developers with standard access
- **frontend-team**: Frontend specialists
- **backend-team**: Backend specialists

#### Specialized Teams
- **security-team**: Security specialists for security-sensitive changes
- **database-team**: Database specialists for schema changes
- **devops-team**: DevOps engineers for infrastructure changes
- **qa-team**: Quality assurance team for testing changes
- **documentation-team**: Technical writers for documentation

### Team Permissions

| Team | Repository Permission | Special Access |
|------|---------------------|----------------|
| core-developers | Admin | All areas |
| developers | Write | Standard development |
| security-team | Write | Security-sensitive files |
| database-team | Write | Database migrations |
| devops-team | Write | CI/CD and infrastructure |
| qa-team | Write | Testing configuration |
| documentation-team | Write | Documentation files |

## Step 5: Configure Notifications

### Security Notifications
1. Navigate to **Settings** → **Notifications**
2. Configure security alert recipients
3. Set up Slack/email integration for security events

### Branch Protection Notifications
1. Configure notifications for failed status checks
2. Set up alerts for protection rule violations
3. Configure escalation procedures

## Step 6: Validation and Testing

### Test Branch Protection
1. Create a test branch from `develop`
2. Make a small change and create a PR to `main`
3. Verify all protection rules are enforced:
   - Required reviews
   - Status checks
   - Code owner reviews

### Test Security Features
1. Attempt to commit a test secret (should be blocked)
2. Verify dependency alerts are working
3. Check that CodeQL scans are running

### Verify Code Owners
1. Create PRs affecting different code areas
2. Verify appropriate code owners are requested for review
3. Test that code owner approval is required

## Step 7: Documentation and Training

### Update Documentation
1. Document the security configuration in team wiki
2. Create onboarding materials for new team members
3. Establish security review procedures

### Team Training
1. Conduct security awareness training
2. Review branch protection workflows
3. Establish incident response procedures

## Monitoring and Maintenance

### Regular Reviews
- **Weekly**: Review security alerts and failed checks
- **Monthly**: Audit team permissions and access
- **Quarterly**: Review and update security policies

### Automated Monitoring
- Set up alerts for security policy violations
- Monitor branch protection bypass attempts
- Track security scan results and trends

## Troubleshooting

### Common Issues

#### Status Checks Not Required
- Verify workflow names match exactly
- Check that workflows are running on the correct branches
- Ensure status check contexts are properly configured

#### Code Owner Reviews Not Working
- Verify CODEOWNERS file syntax
- Check team membership and permissions
- Ensure code owners have repository access

#### Security Scanning Issues
- Verify GitHub Advanced Security is enabled
- Check that secret scanning is properly configured
- Ensure CodeQL workflows are running correctly

### Support Contacts

- **Repository Issues**: devops@hallucifix.com
- **Security Configuration**: security@hallucifix.com
- **Team Access Issues**: admin@hallucifix.com

## Compliance Checklist

- [ ] Repository security features enabled
- [ ] Branch protection rules configured for main and develop
- [ ] Code owners file created and validated
- [ ] Required status checks configured
- [ ] Team permissions properly assigned
- [ ] Security notifications configured
- [ ] Documentation updated
- [ ] Team training completed
- [ ] Monitoring and alerting set up
- [ ] Incident response procedures established

This setup ensures that the HalluciFix repository meets all security requirements while maintaining developer productivity and code quality standards.