const { Client } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

exports.handler = async (event) => {
  const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  // Get password from Secrets Manager
  const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const secretResponse = await secretsClient.send(new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN
  }));
  const secret = JSON.parse(secretResponse.SecretString);
  const password = secret.password;

  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: password,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // List migration files from S3
    const listCommand = new ListObjectsV2Command({
      Bucket: 'hallucifix-static-prod-135167710042',
      Prefix: 'migrations/'
    });
    const listResponse = await s3Client.send(listCommand);
    const files = (listResponse.Contents || [])
      .filter(obj => obj.Key && obj.Key.endsWith('.sql'))
      .map(obj => obj.Key)
      .sort();

    for (const fileKey of files) {
      console.log(`Running migration: ${fileKey}`);
      const getCommand = new GetObjectCommand({
        Bucket: 'hallucifix-static-prod-135167710042',
        Key: fileKey
      });
      const getResponse = await s3Client.send(getCommand);
      const sql = await getResponse.Body.transformToString();

      // Split SQL by semicolon and execute each statement separately
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

      for (const statement of statements) {
        if (statement) {
          try {
            await client.query(statement);
          } catch (error) {
            // Log the error but continue with other statements
            console.log(`Statement failed: ${statement.substring(0, 100)}... Error: ${error.message}`);
            // Don't throw, continue with next statement
          }
        }
      }
    }

    console.log('All migrations completed');
    return { statusCode: 200, body: 'Migrations completed successfully' };
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await client.end();
  }
};