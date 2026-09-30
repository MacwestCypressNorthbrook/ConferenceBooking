type PgError = { code?: string; message: string; details?: string | null };

/** Turns database errors into sentences a person can act on. */
export function friendlyError(error: PgError) {
  switch (error.code) {
    case "23P01":
      return "Someone confirmed a booking for this time a moment ago. Pick another slot.";
    case "42501":
      return "You don't have permission to do that.";
    case "P0001":
      return error.message; // raised by our own triggers and functions — already human-readable
    case "23514":
      return "Some details are invalid. Check the title and times and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
