/**
 * Turns the server's verification state ({ email, expiresInSeconds, resendInSeconds, demoCode? })
 * into absolute deadlines for the countdowns. These timers are display only:
 * the server decides whether a code is expired, locked or rate limited.
 */
export function toVerification(state) {
  const receivedAt = Date.now();
  return {
    email: state.email,
    receivedAt,
    expiresAt: receivedAt + (state.expiresInSeconds ?? 0) * 1000,
    resendAt: receivedAt + (state.resendInSeconds ?? 0) * 1000,
    demoCode: state.demoCode || "",
  };
}

export const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
