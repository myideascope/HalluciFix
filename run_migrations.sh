#!/bin/bash
# Install PostgreSQL client
sudo yum update -y
sudo amazon-linux-extras install postgresql14 -y

# Get database credentials
DB_PASS=$(aws secretsmanager get-secret-value --secret-id arn:aws:secretsmanager:us-east-1:135167710042:secret:hallucifix-db-credentials-prod-7Pa6sU --query 'SecretString' --output text | python3 -c "import sys, json; print(json.load(sys.stdin)['password'])")

# Run migrations
cd /tmp
for file in /tmp/migrations/*.sql; do
    echo "Running $(basename "$file")"
    PGPASSWORD="$DB_PASS" psql -h hallucifix-db-prod.cux2g046wvmj.us-east-1.rds.amazonaws.com -p 5432 -U hallucifix_admin -d hallucifix -f "$file"
done

echo "Migrations completed!"
