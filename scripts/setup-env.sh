#!/bin/bash

# Script to generate .env file from GitHub Codespace secrets or environment variables
# This script checks for environment variables and creates a .env file if they exist

set -euo pipefail

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

echo "🔧 Setting up environment configuration..."

# Function to generate a random DEVICEID if not provided
generate_device_id() {
    # Generate a UUID v4 format device ID
    python3 -c "import uuid; print(str(uuid.uuid4()))" 2>/dev/null || \
    node -e "console.log(require('crypto').randomUUID())" 2>/dev/null || \
    echo "$(openssl rand -hex 8)-$(openssl rand -hex 4)-$(openssl rand -hex 4)-$(openssl rand -hex 4)-$(openssl rand -hex 12)"
}

# Function to check if environment variable exists and is not empty
check_env_var() {
    local var_name="$1"
    local var_value="${!var_name:-}"
    
    if [[ -n "$var_value" ]]; then
        echo "✅ Found $var_name"
        return 0
    else
        echo "❌ Missing $var_name"
        return 1
    fi
}

# Create .env file
create_env_file() {
    cat > "$ENV_FILE" << EOF
# Auto-generated .env file for OnStarJS
# Generated on: $(date)

# Device Configuration
DEVICEID="${DEVICEID:-$(generate_device_id)}"
VIN="${VIN:-}"

# OnStar Account Credentials
ONSTAR_USERNAME="${ONSTAR_USERNAME:-}"
ONSTAR_PASSWORD="${ONSTAR_PASSWORD:-}"
ONSTAR_PIN="${ONSTAR_PIN:-}"
ONSTAR_TOTPKEY="${ONSTAR_TOTPKEY:-}"

# Optional Token Location
TOKEN_LOCATION="${TOKEN_LOCATION:-}"

EOF
    echo "📝 Created $ENV_FILE"
}

# Check if .env already exists and ask for confirmation
if [[ -f "$ENV_FILE" ]]; then
    echo "⚠️  $ENV_FILE already exists."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Aborted. Existing $ENV_FILE was not modified."
        exit 0
    fi
fi

# Check required environment variables
echo "🔍 Checking for required environment variables..."

REQUIRED_VARS=(
    "ONSTAR_USERNAME"
    "ONSTAR_PASSWORD" 
    "ONSTAR_PIN"
    "ONSTAR_TOTPKEY"
)

OPTIONAL_VARS=(
    "DEVICEID"
    "VIN"
    "TOKEN_LOCATION"
)

missing_required=0
for var in "${REQUIRED_VARS[@]}"; do
    if ! check_env_var "$var"; then
        missing_required=1
    fi
done

# Check optional variables
echo "🔍 Checking for optional environment variables..."
for var in "${OPTIONAL_VARS[@]}"; do
    check_env_var "$var" || echo "ℹ️  Optional variable $var not set (will use default or prompt)"
done

if [[ $missing_required -eq 1 ]]; then
    echo ""
    echo "❌ Missing required environment variables!"
    echo "💡 In GitHub Codespaces, you can set these as secrets:"
    echo "   1. Go to your repository settings"
    echo "   2. Navigate to Secrets and variables > Codespaces"
    echo "   3. Add the following secrets:"
    for var in "${REQUIRED_VARS[@]}"; do
        echo "      - $var"
    done
    echo ""
    echo "🔧 Alternatively, you can set them manually:"
    echo "   export ONSTAR_USERNAME='your-email@example.com'"
    echo "   export ONSTAR_PASSWORD='your-password'"
    echo "   export ONSTAR_PIN='your-pin'"
    echo "   export ONSTAR_TOTPKEY='your-totp-key'"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Generate DEVICEID if not provided
if [[ -z "${DEVICEID:-}" ]]; then
    export DEVICEID=$(generate_device_id)
    echo "🔧 Generated new DEVICEID: $DEVICEID"
fi

# Create the .env file
create_env_file

echo "✅ Environment setup complete!"
echo "📁 Your .env file has been created with the following variables:"
echo "   - DEVICEID: ${DEVICEID:0:8}..."
echo "   - VIN: ${VIN:-'(not set)'}"
echo "   - ONSTAR_USERNAME: ${ONSTAR_USERNAME:0:3}***"
echo "   - ONSTAR_PASSWORD: ***"
echo "   - ONSTAR_PIN: ***"
echo "   - ONSTAR_TOTPKEY: ${ONSTAR_TOTPKEY:0:3}***"
echo "   - TOKEN_LOCATION: ${TOKEN_LOCATION:-'(default)'}"
echo ""
echo "🚀 You can now run your OnStarJS tests and applications!"
