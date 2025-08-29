# Scute JS Core Svelte Integration Guide

## Installation

First, install the required packages. The `@scute/js-core` package provides the core authentication client for JavaScript applications.

```bash
npm install @scute/js-core svelte
```

For development, you'll also need TypeScript and Vite for the best development experience:

```bash
npm install -D typescript @sveltejs/vite-plugin-svelte @tsconfig/svelte svelte-check vite
```

## Setup

### 1. Initialize Scute Client

Create a client instance in `scute.ts`. This client will handle all authentication operations and API calls to your Scute backend.

```typescript
import { createClient } from "@scute/js-core";

export const scuteClient = createClient({
  appId: import.meta.env.VITE_SCUTE_APP_ID,
  baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
});
```

### 2. Project Structure

Your Svelte app structure should look like this:

```
src/
├── App.svelte          # Main app component with auth flow
├── app.css            # Styling for the app
├── main.ts            # Svelte app entry point
├── scute.ts           # Scute client configuration
└── lib/
    ├── LoginForm.svelte      # Login form component
    ├── MagicSent.svelte      # Magic link sent confirmation
    ├── MagicVerify.svelte    # Magic link verification
    ├── OtpForm.svelte        # OTP verification form
    ├── RegisterDevice.svelte # Device registration component
    └── Profile.svelte        # User profile and session management
```

## Environment Configuration

Create a `.env` file in your project root:

```env
# Rename this file as .env and enter the app id and base url
VITE_SCUTE_APP_ID=<your_app_id>
VITE_SCUTE_BASE_URL=https://api.scute.io
```

## Key Features

- **Multiple Authentication Methods**: Passkeys, Magic Links, OTP, OAuth
- **Session Management**: Automatic detection, persistence, multi-device support
- **Device Registration**: Optional WebAuthn passkey registration
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Dark Mode**: Automatic dark/light mode support

## Development

```bash
npm install
cp env.example .env  # Edit with your Scute credentials
npm run dev
```

This implementation provides a complete authentication system for Svelte applications using Scute's JS Core package.
