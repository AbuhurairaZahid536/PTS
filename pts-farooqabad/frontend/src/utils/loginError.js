export function loginErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 401) return "Invalid username or password. Passwords are case-sensitive.";
  if (status === 429) return "Too many login attempts. Please wait a few minutes and try again.";
  if (status >= 500) return "The sign-in server is temporarily unavailable. Please try again shortly.";
  if (error?.name === "SecurityError" || error?.name === "QuotaExceededError") {
    return "This browser could not save your session. Allow site storage and try again.";
  }
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return "The sign-in request timed out. Check your connection and try again.";
  }
  if (!error?.response) return "Could not connect to the sign-in server. Check your connection and try again.";
  return error.response.data?.message || "Unable to sign in. Please try again.";
}
