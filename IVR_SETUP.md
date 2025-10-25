# IVR Solutions - Click-to-Call Setup Guide

This guide helps you configure the IVR Solutions integration for OrderFlowAI's Click-to-Call feature.

## Overview

The IVR Solutions integration allows agents to initiate calls to customers directly from the orders table with a single click. When an agent clicks the phone button, their desk phone rings, and once they pick up, the customer is automatically called.

## Prerequisites

- Active IVR Solutions account
- API access enabled
- DID (Direct Inward Dialing) number configured
- Agent phone extensions set up in IVR system

## Required Credentials

You'll need three pieces of information from your IVR Solutions account:

### 1. API Token
- **Where to find**: IVR Solutions Dashboard > Settings > API Credentials
- **Format**: Long alphanumeric string (e.g., `abc123xyz456...`)
- **Purpose**: Authenticates your requests to the IVR API

### 2. DID Number
- **Where to find**: IVR Solutions Dashboard > Phone Numbers
- **Format**: Your assigned phone number (e.g., `919876543210`)
- **Purpose**: The outbound caller ID shown to customers

### 3. Agent Extensions
- **Where to find**: IVR Solutions Dashboard > Extensions or Phone System
- **Format**: 3-4 digit numbers (e.g., `101`, `102`, `103`)
- **Purpose**: Routes calls to specific agent phones

## Setup Steps

### Step 1: Add Credentials to Replit Secrets

1. Open your Replit project
2. Click on "Secrets" in the left sidebar (🔐 icon)
3. Add the following secrets:

   ```
   IVR_API_TOKEN = your_api_token_here
   IVR_DID_NUMBER = your_did_number_here
   ```

4. Click "Add new secret" for each one
5. Restart your application after adding secrets

### Step 2: Configure Agent Extensions

1. Log in as an admin user
2. Navigate to Settings > Team
3. For each agent:
   - Click "Edit" next to their name
   - Enter their IVR extension number (e.g., `101`)
   - Click "Save"

### Step 3: Test the Connection

1. Go to Settings > Shopify (or Settings page)
2. Scroll to "IVR Connection" section
3. Click "Test IVR Connection"
4. You should see:
   - ✅ **Credentials are valid!** (Success)
   - Your masked API token and DID number
   - Status: "Connected"

## How to Use Click-to-Call

Once configured, agents can:

1. Log in and go to the Orders page
2. Find their assigned COD orders
3. Click the phone icon (📞) in the Actions column
4. Their phone will ring
5. After picking up, the customer is automatically called
6. Order status is tracked in the system

## Common Error Codes & Solutions

### 405 - Access Denied

**Error Message**: "Method Not Allowed" or "Access Denied"

**Possible Causes**:
- API token is incorrect or expired
- API token doesn't have permission for this DID number
- Authorization header format is wrong
- Account suspended or not activated

**Solutions**:
1. Verify API token in IVR Solutions dashboard
2. Copy the token exactly (no extra spaces)
3. Check if DID number matches your account
4. Ensure your IVR account is active and in good standing
5. Contact IVR Solutions support if issue persists

### 400 - Invalid Parameters

**Error Message**: "Invalid call parameters"

**Possible Causes**:
- Agent extension not configured
- Phone number format incorrect
- DID number is invalid or inactive

**Solutions**:
1. Verify agent has an extension assigned in Team Settings
2. Check phone number format (must be 10 digits)
3. Confirm DID number is active in IVR dashboard

### 500 - Server Error

**Error Message**: "IVR service temporarily unavailable"

**Possible Causes**:
- IVR Solutions API is down
- Network connectivity issues
- Temporary service disruption

**Solutions**:
1. Wait a few minutes and try again
2. Check IVR Solutions status page
3. Contact IVR Solutions support if persists

## API Endpoint Details

### Click-to-Call Endpoint

**URL**: `https://api.ivrsolutions.in/api/c2c_post`

**Method**: POST

**Headers**:
```
Content-Type: application/json
Authorization: Bearer {YOUR_API_TOKEN}
```

**Request Body**:
```json
{
  "did": "YOUR_DID_NUMBER",
  "ext_no": "AGENT_EXTENSION",
  "phone": "CUSTOMER_PHONE"
}
```

**Success Response (200)**:
```json
{
  "status": "success",
  "message": "Call initiated"
}
```

**Error Response (405)**:
```json
{
  "status": 401,
  "message": "Method Not Allowed 1"
}
```

## Testing Checklist

Before going live, verify:

- [ ] IVR_API_TOKEN is set in Replit Secrets
- [ ] IVR_DID_NUMBER is set in Replit Secrets
- [ ] All agents have extensions configured
- [ ] Test connection shows "Connected" status
- [ ] Test call successfully connects to agent phone
- [ ] Customer phone number is called after agent picks up
- [ ] Call records are saved in database

## Troubleshooting

### Connection Test Fails

1. Check Replit Secrets are set correctly
2. Verify no extra spaces in token or DID
3. Restart the application
4. Try the test again

### Calls Not Connecting

1. Verify agent extension is correct
2. Check if agent's phone is registered with IVR
3. Confirm DID number is active
4. Test with a known working phone number

### Missing Phone Button

The phone button only appears for:
- Orders assigned to the logged-in agent
- COD (Cash on Delivery) payment method
- Orders not in "Delivered" or "Cancelled" status

## Support

### IVR Solutions Support
- Dashboard: https://www.ivrsolutions.in
- Support: Contact through your IVR dashboard
- Documentation: Available in your IVR account

### OrderFlowAI Support
- Use the Test IVR Connection tool in Settings
- Check server logs for detailed error messages
- Review this setup guide for common issues

## Security Notes

- API tokens are sensitive - never share them
- Tokens are masked in the UI (showing first 8 and last 4 characters)
- Store all credentials in Replit Secrets, not in code
- Rotate API tokens periodically for security

## Additional Resources

- IVR Solutions API Documentation (available in your account)
- OrderFlowAI Settings > IVR Connection for live testing
- Server logs for detailed debugging information
