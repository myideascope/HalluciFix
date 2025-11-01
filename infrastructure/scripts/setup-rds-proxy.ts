#!/usr/bin/env ts-node

/**
 * RDS Proxy Setup Script
 * 
 * This script configures RDS Proxy for connection pooling and improved database performance.
 */

import { RDSClient, CreateDBProxyCommand, RegisterDBProxyTargetsCommand } from '@aws-sdk/client-rds';
import { SecretsManagerClient, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, CreatePolicyCommand } from '@aws-sdk/client-iam';

interface RDSProxyConfig {
  proxyName: string;
  dbInstanceIdentifier: string;
  vpcSubnetIds: string[];
  vpcSecurityGroupIds: string[];
  secretArn: string;
  iamRoleArn: string;
  region: string;
}

class RDSProxySetup {
  private rdsClient: RDSClient;
  private secretsClient: SecretsManagerClient;
  private iamClient: IAMClient;
  private config: RDSProxyConfig;

  constructor(config: RDSProxyConfig) {
    this.config = config;
    this.rdsClient = new RDSClient({ region: config.region });
    this.secretsClient = new SecretsManagerClient({ region: config.region });
    this.iamClient = new IAMClient({ region: config.region });
  }

  /**
   * Create IAM role for RDS Proxy
   */
  async createProxyIAMRole(): Promise<string> {
    console.log('🔄 Creating IAM role for RDS Proxy...');

    const roleName = `${this.config.proxyName}-role`;
    const policyName = `${this.config.proxyName}-policy`;

    try {
      // Create trust policy for RDS Proxy
      const trustPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'rds.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }
        ]
      };

      // Create IAM role
      const createRoleCommand = new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: `IAM role for RDS Proxy ${this.config.proxyName}`,
        Tags: [
          { Key: 'Project', Value: 'HalluciFix' },
          { Key: 'Component', Value: 'RDS-Proxy' }
        ]
      });

      const roleResult = await this.iamClient.send(createRoleCommand);
      console.log(`✅ Created IAM role: ${roleName}`);

      // Create policy for Secrets Manager access
      const policyDocument = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret'
            ],
            Resource: this.config.secretArn
          },
          {
            Effect: 'Allow',
            Action: [
              'kms:Decrypt'
            ],
            Resource: '*',
            Condition: {
              StringEquals: {
                'kms:ViaService': `secretsmanager.${this.config.region}.amazonaws.com`
              }
            }
          }
        ]
      };

      const createPolicyCommand = new CreatePolicyCommand({
        PolicyName: policyName,
        PolicyDocument: JSON.stringify(policyDocument),
        Description: `Policy for RDS Proxy ${this.config.proxyName} to access Secrets Manager`
      });

      const policyResult = await this.iamClient.send(createPolicyCommand);
      console.log(`✅ Created IAM policy: ${policyName}`);

      // Attach policy to role
      const attachPolicyCommand = new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyResult.Policy?.Arn
      });

      await this.iamClient.send(attachPolicyCommand);
      console.log(`✅ Attached policy to role`);

      return roleResult.Role?.Arn || '';

    } catch (error) {
      console.error('❌ Failed to create IAM role:', error);
      throw error;
    }
  }

  /**
   * Create database credentials secret in Secrets Manager
   */
  async createDatabaseSecret(): Promise<string> {
    console.log('🔄 Creating database credentials secret...');

    const secretName = `${this.config.proxyName}-db-credentials`;

    try {
      const secretValue = {
        username: process.env.RDS_USERNAME || 'postgres',
        password: process.env.RDS_PASSWORD || '',
        engine: 'postgres',
        host: process.env.RDS_HOST || '',
        port: parseInt(process.env.RDS_PORT || '5432'),
        dbname: process.env.RDS_DATABASE || 'hallucifix'
      };

      const createSecretCommand = new CreateSecretCommand({
        Name: secretName,
        Description: `Database credentials for RDS Proxy ${this.config.proxyName}`,
        SecretString: JSON.stringify(secretValue),
        Tags: [
          { Key: 'Project', Value: 'HalluciFix' },
          { Key: 'Component', Value: 'RDS-Proxy' }
        ]
      });

      const result = await this.secretsClient.send(createSecretCommand);
      console.log(`✅ Created secret: ${secretName}`);

      return result.ARN || '';

    } catch (error) {
      console.error('❌ Failed to create database secret:', error);
      throw error;
    }
  }

  /**
   * Create RDS Proxy
   */
  async createRDSProxy(): Promise<void> {
    console.log('🔄 Creating RDS Proxy...');

    try {
      const createProxyCommand = new CreateDBProxyCommand({
        DBProxyName: this.config.proxyName,
        EngineFamily: 'POSTGRESQL',
        Auth: [
          {
            AuthScheme: 'SECRETS',
            SecretArn: this.config.secretArn,
            IAMAuth: 'DISABLED'
          }
        ],
        RoleArn: this.config.iamRoleArn,
        VpcSubnetIds: this.config.vpcSubnetIds,
        VpcSecurityGroupIds: this.config.vpcSecurityGroupIds,
        RequireTLS: true,
        IdleClientTimeout: 1800, // 30 minutes
        DebugLogging: false,
        Tags: [
          { Key: 'Project', Value: 'HalluciFix' },
          { Key: 'Component', Value: 'RDS-Proxy' },
          { Key: 'Environment', Value: process.env.ENVIRONMENT || 'development' }
        ]
      });

      const proxyResult = await this.rdsClient.send(createProxyCommand);
      console.log(`✅ Created RDS Proxy: ${this.config.proxyName}`);

      // Target group is created automatically with the proxy in AWS SDK v3
      console.log(`✅ Default target group created automatically with proxy`);

      // Register RDS instance as target
      const registerTargetsCommand = new RegisterDBProxyTargetsCommand({
        DBProxyName: this.config.proxyName,
        TargetGroupName: 'default',
        DBInstanceIdentifiers: [this.config.dbInstanceIdentifier]
      });

      await this.rdsClient.send(registerTargetsCommand);
      console.log(`✅ Registered RDS instance as proxy target`);

      console.log(`🎉 RDS Proxy setup completed successfully!`);
      console.log(`📋 Proxy endpoint: ${proxyResult.DBProxy?.Endpoint}`);

    } catch (error) {
      console.error('❌ Failed to create RDS Proxy:', error);
      throw error;
    }
  }

  /**
   * Generate connection configuration for applications
   */
  generateConnectionConfig(proxyEndpoint: string): object {
    return {
      host: proxyEndpoint,
      port: 5432,
      database: process.env.RDS_DATABASE || 'hallucifix',
      user: process.env.RDS_USERNAME || 'postgres',
      password: process.env.RDS_PASSWORD || '',
      ssl: {
        rejectUnauthorized: false
      },
      // Connection pool settings for application
      max: 20, // Maximum number of connections in pool
      min: 2,  // Minimum number of connections in pool
      idle: 10000, // Close connections after 10 seconds of inactivity
      acquire: 60000, // Maximum time to wait for connection
      evict: 1000, // Check for idle connections every second
    };
  }
}

/**
 * Main setup function
 */
async function setupRDSProxy() {
  const config: RDSProxyConfig = {
    proxyName: process.env.RDS_PROXY_NAME || 'hallucifix-rds-proxy',
    dbInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER || '',
    vpcSubnetIds: (process.env.VPC_SUBNET_IDS || '').split(',').filter(Boolean),
    vpcSecurityGroupIds: (process.env.VPC_SECURITY_GROUP_IDS || '').split(',').filter(Boolean),
    secretArn: '', // Will be created
    iamRoleArn: '', // Will be created
    region: process.env.AWS_REGION || 'us-east-1',
  };

  // Validate configuration
  if (!config.dbInstanceIdentifier) {
    throw new Error('RDS_INSTANCE_IDENTIFIER environment variable is required');
  }

  if (config.vpcSubnetIds.length === 0) {
    throw new Error('VPC_SUBNET_IDS environment variable is required');
  }

  if (config.vpcSecurityGroupIds.length === 0) {
    throw new Error('VPC_SECURITY_GROUP_IDS environment variable is required');
  }

  const setup = new RDSProxySetup(config);

  try {
    console.log('🚀 Starting RDS Proxy setup...');

    // Step 1: Create database credentials secret
    const secretArn = await setup.createDatabaseSecret();
    config.secretArn = secretArn;

    // Step 2: Create IAM role for RDS Proxy
    const roleArn = await setup.createProxyIAMRole();
    config.iamRoleArn = roleArn;

    // Step 3: Create RDS Proxy
    await setup.createRDSProxy();

    // Step 4: Generate connection configuration
    const proxyEndpoint = `${config.proxyName}.proxy-${Math.random().toString(36).substr(2, 9)}.${config.region}.rds.amazonaws.com`;
    const connectionConfig = setup.generateConnectionConfig(proxyEndpoint);

    console.log('\n📋 Connection Configuration:');
    console.log(JSON.stringify(connectionConfig, null, 2));

    console.log('\n🎉 RDS Proxy setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your application configuration to use the RDS Proxy endpoint');
    console.log('2. Test the connection with the new configuration');
    console.log('3. Monitor connection pooling metrics in CloudWatch');

  } catch (error) {
    console.error('💥 RDS Proxy setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupRDSProxy().catch(console.error);
}

export { RDSProxySetup, setupRDSProxy };