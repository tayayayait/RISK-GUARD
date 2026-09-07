interface AuthenticatedUser {
  id: string;
}

interface AuthUserClient {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: AuthenticatedUser | null };
      error: unknown;
    }>;
  };
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function requireAuthenticatedUserId(
  request: Request,
  client: AuthUserClient,
) {
  const token = readBearerToken(request);
  if (!token) {
    throw new Error("AUTH_REQUIRED:Bearer token is required.");
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new Error("AUTH_REQUIRED:Bearer token is invalid or expired.");
  }

  return data.user.id;
}
