/**
 * Archive-retention arithmetic for deleting an archived Session's stored log.
 *
 * The archive set records when each Session entered it; this module turns that
 * instant plus the Host's configured window into the one answer both sides
 * need: from when may the Session be deleted, and is it due now. The Host
 * enforces it on the command; the Client renders the same answer on the row,
 * so a button never offers something the Host would refuse.
 * @module @deepseek-ai/dsh-api-workspace-controller/src/retention
 */

/** Milliseconds in one retention day; the window's unit. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The instant from which one archived Session may be deleted.
 * @param archivedAt - ISO-8601 archive instant.
 * @param retentionDays - whole days an archived Session stays undeletable.
 * @returns epoch milliseconds; `NaN` when the stored instant is unreadable.
 */
export function deletionEligibleAt(archivedAt: string, retentionDays: number): number {
  return Date.parse(archivedAt) + retentionDays * DAY_MS
}

/**
 * Whether one archived Session has reached the Host's deletion threshold. An
 * unknown archive instant — a set member whose record predates the field — is
 * never due: an age nothing can prove must not cost a Session.
 * @param archivedAt - ISO-8601 archive instant, or undefined when unknown.
 * @param retentionDays - whole days an archived Session stays undeletable.
 * @param now - current epoch milliseconds.
 * @returns whether the Session may be deleted.
 */
export function deletionDue(
  archivedAt: string | undefined,
  retentionDays: number,
  now: number,
): boolean {
  return archivedAt !== undefined && now >= deletionEligibleAt(archivedAt, retentionDays)
}

/**
 * Project one archive timetable through the retention window, so a Client can
 * render deletion availability without knowing the policy that produced it.
 * @param archivedAt - archive instants by archived Session id.
 * @param retentionDays - whole days an archived Session stays undeletable.
 * @returns the deletion instant per id, for the ids the timetable carries.
 */
export function deletionTimes(
  archivedAt: Readonly<Record<string, string>>,
  retentionDays: number,
): Readonly<Record<string, string>> {
  const times: Record<string, string> = {}
  for (const [id, instant] of Object.entries(archivedAt)) {
    times[id] = new Date(deletionEligibleAt(instant, retentionDays)).toISOString()
  }
  return times
}
