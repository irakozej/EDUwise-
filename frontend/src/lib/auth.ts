// sessionStorage: each browser tab is fully isolated — multiple users
// can be logged in simultaneously in different tabs without conflict.
// Tokens persist through page refreshes within the same tab but are
// cleared when the tab is closed (which is also fine for security).

export function setAccessToken(token: string) {
  sessionStorage.setItem("eduwise_access_token", token);
}

export function clearAccessToken() {
  sessionStorage.removeItem("eduwise_access_token");
  sessionStorage.removeItem("eduwise_refresh_token");
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem("eduwise_access_token");
}

export function setRefreshToken(token: string) {
  sessionStorage.setItem("eduwise_refresh_token", token);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem("eduwise_refresh_token");
}
