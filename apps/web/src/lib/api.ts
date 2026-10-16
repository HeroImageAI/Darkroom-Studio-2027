let token = "";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (options.method && !["GET", "HEAD"].includes(options.method) && !token)
    token = (await api<{ token: string }>("/session")).token;
  const headers = new Headers(options.headers);
  if (token) headers.set("x-darkroom-token", token);
  if (options.body && !(options.body instanceof FormData))
    headers.set("content-type", "application/json");
  const response = await fetch("/api" + path, { ...options, headers });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Local service unavailable" }));
    throw Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}
