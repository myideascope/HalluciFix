# GitHub Repository Configuration

This directory contains the GitHub repository configuration files for the HalluciFix project, implementing comprehensive security settings, branch protection rules, and code ownership policies.

## 📁 Files Overview

### Core Configuration Files

- **`settings.yml`** - Repository settings configuration (for GitHub Settings app)
- **`CODEOWNERS`** - Code ownership and review requirements
- **`security.md`** - Security policy and incident response procedures

### Documentation

- **`repository-setup.md`** - Step-by-step setup guide for repository administrators
- **`README.md`** - This file, providing overview and usage instructions

### Validation Tools

- **`branch-protection-validation.js`** - Automated validation script for branch protection rules

## 🛡️ Security Features Implemented

### Repository Security Settings
- ✅ Vulnerability alerts enabled
- ✅ Security advisories enabled  
- ✅ Dependency graph enabled
- ✅ Secret scanning with push protection
- ✅ Dependabot security updates enabled

### Branch Protection Rules

#### Main Branch (`main`)
- **Required Reviews**: 2 approving reviews
- **Code Owner Reviews**: Required
- **Status Checks**: Unit Tests, Integration Tests, Security Scan, Coverage Check, Build, Lint
- **Additional Protections**: Force pushes disabled, deletions disabled, admin enforcement enabled

#### Develop Branch (`develop`)
- **Required Reviews**: 1 approving review
- **Status Checks**: Unit Tests, Integration Tests, Build, Lint
- **Additional Protections**: Force pushes disabled, deletions disabled

### Code Ownership

The `CODEOWNERS` file defines review requirements for different parts of the codebase:

- **Global**: `@core-developers` for all changes
- **Frontend**: `@frontend-team` for UI components and hooks
- **Backend**: `@backend-team` for services and API
- **Security**: `@security-team` for authentication and security files
- **Database**: `@database-team` for migrations and schema changes
- **DevOps**: `@devops-team` for CI/CD and infrastructure
- **Documentation**: `@documentation-team` for docs and README files

## 🚀 Quick Start

### For Repository Administrators

1. **Review the setup guide**: Read `.github/repository-setup.md` for detailed configuration steps
2. **Configure teams**: Ensure all required GitHub teams are created and populated
3. **Apply settings**: Use the `settings.yml` file with GitHub Settings app or configure manually
4. **Validate configuration**: Run the validation script to ensure everything is properly configured

```bash
npm run github:validate-protection
```

### For Developers

1. **Understand code ownership**: Check `CODEOWNERS` to see who reviews your changes
2. **Follow security practices**: Review `security.md` for security guidelines
3. **Ensure status checks pass**: All required checks must pass before merging

## 🔧 Validation and Monitoring

### Automated Validation

Run the branch protection validation script:

```bash
# Validate current branch protection settings
npm run github:validate-protection

# Set required environment variables
export GITHUB_TOKEN="your_github_token"
export GITHUB_REPOSITORY_OWNER="your_org"
export GITHUB_REPOSITORY_NAME="your_repo"
```

### Manual Validation Checklist

- [ ] Repository security features enabled
- [ ] Branch protection rules configured for `main` and `develop`
- [ ] Required status checks configured and working
- [ ] Code owners file exists and is valid
- [ ] Teams have appropriate permissions
- [ ] Security notifications configured

## 📋 Required GitHub Teams

Ensure these teams exist in your GitHub organization:

### Core Teams
- `core-developers` - Senior developers with admin access
- `developers` - Regular developers with write access
- `frontend-team` - Frontend specialists
- `backend-team` - Backend specialists

### Specialized Teams  
- `security-team` - Security specialists
- `database-team` - Database administrators
- `devops-team` - DevOps engineers
- `qa-team` - Quality assurance team
- `documentation-team` - Technical writers

## 🔐 Security Considerations

### Secret Management
- Never commit secrets to the repository
- Use GitHub Secrets for sensitive configuration
- Enable secret scanning push protection
- Rotate secrets regularly

### Code Review Process
- All changes require appropriate reviews
- Security-sensitive changes require security team review
- Database changes require database team review
- CI/CD changes require DevOps team review

### Incident Response
- Follow procedures outlined in `security.md`
- Report security issues through private channels
- Coordinate disclosure with security team

## 📊 Monitoring and Compliance

### Security Monitoring
- Security alerts are sent to designated teams
- Failed status checks trigger notifications
- Branch protection violations are logged and alerted

### Compliance Requirements
- Audit logs retained for 90+ days
- Regular access reviews conducted
- Security policies reviewed quarterly

## 🛠️ Troubleshooting

### Common Issues

**Status checks not working**
- Verify workflow names match exactly in branch protection settings
- Check that workflows run on the correct branches
- Ensure GitHub Actions are enabled

**Code owner reviews not required**
- Verify `CODEOWNERS` file syntax
- Check team membership and repository access
- Ensure teams have appropriate permissions

**Security scanning issues**
- Verify GitHub Advanced Security is enabled
- Check organization security settings
- Ensure proper permissions for security features

### Getting Help

- **Repository Configuration**: devops@hallucifix.com
- **Security Issues**: security@hallucifix.com  
- **Team Access**: admin@hallucifix.com

## 📚 Additional Resources

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [GitHub Security Features](https://docs.github.com/en/code-security)
- [Code Owners Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub Settings App](https://github.com/apps/settings)

## 📝 Maintenance

This configuration should be reviewed and updated:
- **Monthly**: Review team memberships and permissions
- **Quarterly**: Update security policies and procedures  
- **As needed**: Adjust protection rules based on workflow changes

---

**Last Updated**: $(date)  
**Configuration Version**: 1.0  
**Maintained by**: DevOps Team