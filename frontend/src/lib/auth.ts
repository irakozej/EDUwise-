export function setAccessToken(token: string) {
  localStorage.setItem("eduwise_access_token", token);
}

export function clearAccessToken() {
  localStorage.removeItem("eduwise_access_token");
  localStorage.removeItem("eduwise_refresh_token");
}

export function getAccessToken(): string | null {
  return localStorage.getItem("eduwise_access_token");
}

export function setRefreshToken(token: string) {
  localStorage.setItem("eduwise_refresh_token", token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("eduwise_refresh_token");
}