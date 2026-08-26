const VERIFIER_KEY = "bingo-musical:pkce-verifier";

export function base64Url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64Url(randomBytes);
  
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = base64Url(hash);
  
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  return { verifier, challenge };
}

export function consumeVerifier(): string | null {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  return verifier;
}
