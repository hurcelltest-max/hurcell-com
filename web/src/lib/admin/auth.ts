export function verifyBasicAuthHeader(authHeader: string | null, validUser?: string, validPass?: string): boolean {
  if (!authHeader || !validUser || !validPass) {
    return false;
  }

  if (!authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.substring(6).trim();
    if (!base64Credentials) {
      return false;
    }

    // atob is globally available in Node.js and Edge runtimes
    const credentials = atob(base64Credentials);
    const colonIndex = credentials.indexOf(':');
    if (colonIndex === -1) {
      return false;
    }

    const username = credentials.substring(0, colonIndex);
    const password = credentials.substring(colonIndex + 1);

    return username === validUser && password === validPass;
  } catch {
    return false;
  }
}

export function getVerifiedAdminUsername(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (verifyBasicAuthHeader(authHeader, validUsername, validPassword)) {
    return validUsername || null;
  }
  return null;
}
