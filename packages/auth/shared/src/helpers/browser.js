

 export const browserSupportsWebAuthn = () => {
    return (
      window?.PublicKeyCredential !== undefined && typeof window.PublicKeyCredential === 'function'
    );
  }
  
 export const platformAuthenticatorIsAvailable = async() => {
    if (!browserSupportsWebAuthn()) {
      return false;
    }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }