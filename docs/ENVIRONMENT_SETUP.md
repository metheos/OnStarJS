# Environment Setup for OnStarJS in Codespaces

This guide explains how to dynamically generate a `.env` file in GitHub Codespaces using saved credentials.

## Overview

OnStarJS requires several environment variables to authenticate with the OnStar API:

- `ONSTAR_USERNAME` - Your OnStar account email
- `ONSTAR_PASSWORD` - Your OnStar account password
- `ONSTAR_PIN` - Your OnStar PIN
- `ONSTAR_TOTPKEY` - Your TOTP secret key for 2FA
- `DEVICEID` - Device UUID (auto-generated if not provided)
- `VIN` - Vehicle Identification Number (optional)
- `TOKEN_LOCATION` - Token storage location (optional)

## Setup Methods

### Method 1: GitHub Codespace Secrets (Recommended)

This is the most secure method for storing credentials in GitHub Codespaces.

#### Step 1: Configure Codespace Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Secrets and variables** > **Codespaces**
3. Add the following repository secrets:
   - `ONSTAR_USERNAME` - Your OnStar email
   - `ONSTAR_PASSWORD` - Your OnStar password
   - `ONSTAR_PIN` - Your OnStar PIN
   - `ONSTAR_TOTPKEY` - Your TOTP secret key
   - `VIN` - Your vehicle VIN (optional)

#### Step 2: Generate Environment File

Once your codespace starts, the environment will be automatically configured through the `postCreateCommand` in `.devcontainer/devcontainer.json`.

Alternatively, you can manually run:

```bash
# Using Node.js script (recommended)
npm run setup:env

# Using bash script
npm run setup:env:bash

# Or directly
node scripts/setup-env.js
```

### Method 2: Manual Environment Variables

If you prefer to set environment variables manually:

```bash
export ONSTAR_USERNAME="your-email@example.com"
export ONSTAR_PASSWORD="your-password"
export ONSTAR_PIN="your-pin"
export ONSTAR_TOTPKEY="your-totp-key"
export VIN="your-vin"  # optional

# Generate .env file
npm run setup:env
```

### Method 3: Interactive Setup

For development environments where you want to be prompted for credentials:

```bash
# This will prompt for missing values
node scripts/setup-env.js
```

## Setup Scripts

### Node.js Setup Script (`scripts/setup-env.js`)

Features:

- ✅ Checks for required environment variables
- ✅ Generates UUID for DEVICEID if not provided
- ✅ Creates formatted .env file with timestamps
- ✅ Validates environment before proceeding
- ✅ Provides helpful setup instructions
- ✅ Masks sensitive data in output

### Bash Setup Script (`scripts/setup-env.sh`)

Features:

- ✅ Cross-platform shell script
- ✅ UUID generation fallback methods
- ✅ Environment validation
- ✅ Colorized output
- ✅ Confirmation prompts

## Security Considerations

### Best Practices

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Use Codespace secrets** for production credentials
3. **Rotate TOTP keys** regularly
4. **Use device-specific UUIDs** for DEVICEID

### TOTP Setup

Your OnStar account must be configured for "Third-Party Authenticator App":

1. Log into your OnStar account
2. Go to Security Settings
3. Change MFA method to "Third-Party Authenticator App"
4. Use the setup URL or scan the QR code to get the secret key
5. Set the secret as `ONSTAR_TOTPKEY`

> **Note**: The "Third-Party Authenticator App" option may not be visible on mobile. Use a desktop browser.

## Generated .env File Structure

```bash
# Auto-generated .env file for OnStarJS
# Generated on: 2025-01-29T...

# Device Configuration
DEVICEID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
VIN="YOUR_VIN_HERE"

# OnStar Account Credentials
ONSTAR_USERNAME="your-email@example.com"
ONSTAR_PASSWORD="your-password"
ONSTAR_PIN="your-pin"
ONSTAR_TOTPKEY="your-totp-secret"

# Optional Configuration
TOKEN_LOCATION=""
```

## Testing Your Setup

After generating your `.env` file, test the authentication:

```bash
# Test authentication
npm run test:auth

# Test full functionality
npm run test:functional

# Run specific tests
npm run test:keys
```

## Troubleshooting

### Common Issues

1. **Missing environment variables**

   ```text
   ❌ Missing ONSTAR_USERNAME: OnStar account email
   ```

   **Solution**: Set the missing environment variables as Codespace secrets

2. **Invalid TOTP key**

   ```text
   Authentication failed: Invalid TOTP
   ```

   **Solution**: Verify your TOTP secret key is correct and properly formatted

3. **Device ID conflicts**

   ```text
   Device not recognized
   ```

   **Solution**: Generate a new DEVICEID or use a consistent one across sessions

### Debug Mode

Enable debug logging by setting:

```bash
export DEBUG=onstar:*
```

### Manual Recovery

If automatic setup fails, you can manually create the `.env` file:

```bash
cp .env.example .env
# Edit .env with your actual values
```

## Integration with Development Workflow

### VS Code Integration

The setup scripts integrate with VS Code tasks and can be run from the Command Palette:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Tasks: Run Task"
3. Select "npm: setup:env"

### CI/CD Integration

For automated testing in CI/CD pipelines, set the environment variables as repository secrets and they'll be automatically available.

## Advanced Configuration

### Custom Token Location

```bash
export TOKEN_LOCATION="./custom-token-folder"
npm run setup:env
```

### Multiple Environments

Create environment-specific configurations:

```bash
# Development
cp .env .env.development

# Staging
cp .env .env.staging

# Production (use Codespace secrets)
```

### Environment Validation

The setup scripts include validation to ensure all required variables are present and properly formatted before creating the `.env` file.

## Support

If you encounter issues:

1. Check the [OnStarJS documentation](../README.md)
2. Verify your OnStar account settings
3. Ensure TOTP is properly configured
4. Check Codespace secrets are correctly set

For additional help, refer to the project's issue tracker or documentation.
