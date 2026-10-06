function validTimeZone(candidate: string | undefined) {
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    console.error(`APP_TIME_ZONE "${candidate}" isn't a valid time zone; using America/Phoenix.`);
    return null;
  }
}

/**
 * The time zone moments are shown in when a page is rendered on the server, which itself
 * runs in UTC. Set APP_TIME_ZONE to an IANA name; the default is the Arizona service center's.
 * Calendar dates (promised, quoted, parts ordered) are stored as midnight UTC and are always
 * formatted with timeZone "UTC" instead, so they never shift a day.
 */
export const shopTimeZone = validTimeZone(process.env.APP_TIME_ZONE) ?? "America/Phoenix";
