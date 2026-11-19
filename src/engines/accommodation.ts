/**
 * Accommodation engine (spec §12): rooming list, room count, room nights, costs and conflicts.
 * Guests sharing the same roomLabel occupy one room.
 */
import { round, trace, type CalcTrace, type Issue } from "./trace";
import type { AccommodationSnap, HotelSnap } from "./snapshot";

export interface Room {
  key: string;
  hotelName: string | null;
  roomType: string | null;
  capacity: number | null;
  guests: string[];
  checkIn: Date | null;
  checkOut: Date | null;
  nights: number | null;
  nightlyRate: number | null;
  currency: string;
  cost: number | null;
  status: string;
}

export interface AccommodationResult {
  rooms: Room[];
  roomCount: number;
  roomNights: number;
  guestCount: number;
  costByCurrency: Record<string, number>;
  unconfirmed: number;
  traces: CalcTrace[];
  issues: Issue[];
}

const DAY = 86400000;
export const nightsBetween = (a: Date, b: Date) => Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / DAY);

export function planAccommodation(list: AccommodationSnap[], hotels: HotelSnap[], eventWindow?: { start: Date; end: Date }): AccommodationResult {
  const issues: Issue[] = [];
  const rt = new Map(hotels.flatMap((h) => h.roomTypes.map((r) => [r.id, { ...r, hotelName: h.name }] as const)));
  const hotelName = new Map(hotels.map((h) => [h.id, h.name]));

  for (const a of list) {
    const who = a.guestName ?? "(unnamed guest)";
    if (!a.guestName) issues.push({ severity: "error", code: "ACC_NAME_MISSING", department: "ACCOMMODATION", subjectId: a.id, message: `Rooming entry ${a.id.slice(-6)} has no guest name`, question: "Who is the guest for this room entry?" });
    if (!a.checkIn || !a.checkOut) issues.push({ severity: "error", code: "ACC_DATES_MISSING", department: "ACCOMMODATION", subjectId: a.id, message: `${who}: check-in or check-out date missing` });
    else if (a.checkOut <= a.checkIn) issues.push({ severity: "error", code: "ACC_DATES_INVALID", department: "ACCOMMODATION", subjectId: a.id, message: `${who}: check-out is not after check-in` });
    if (eventWindow && a.checkOut && a.checkOut < eventWindow.end && a.checkIn && a.checkIn <= eventWindow.end) {
      issues.push({ severity: "warning", code: "ACC_LEAVES_EARLY", department: "ACCOMMODATION", subjectId: a.id, message: `${who} checks out before the event ends — confirm this is intended` });
    }
    if (!a.hotelId || !a.roomTypeId) issues.push({ severity: "warning", code: "ACC_HOTEL_MISSING", department: "ACCOMMODATION", subjectId: a.id, message: `${who}: hotel / room type not assigned` });
    if (a.bookingStatus !== "CONFIRMED") issues.push({ severity: "warning", code: "ACC_UNCONFIRMED", department: "ACCOMMODATION", subjectId: a.id, message: `${who}: booking ${a.bookingStatus.toLowerCase()} — no confirmation yet` });
  }
  // overlapping bookings for the same person
  const byPerson = new Map<string, AccommodationSnap[]>();
  for (const a of list) if (a.personKey) byPerson.set(a.personKey, [...(byPerson.get(a.personKey) ?? []), a]);
  for (const [, arr] of byPerson) {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const x = arr[i], y = arr[j];
      if (x.checkIn && x.checkOut && y.checkIn && y.checkOut && x.checkIn < y.checkOut && y.checkIn < x.checkOut) {
        issues.push({ severity: "error", code: "ACC_OVERLAP", department: "ACCOMMODATION", subjectId: y.id, message: `${x.guestName ?? x.personKey}: overlapping bookings` });
      }
    }
  }

  // rooms: shared label → one room
  const groups = new Map<string, AccommodationSnap[]>();
  for (const a of list) {
    const key = a.sharedRoom && a.roomLabel ? `${a.hotelId}|${a.roomLabel}` : `single|${a.id}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const rooms: Room[] = [];
  for (const [key, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = g[0];
    const type = first.roomTypeId ? rt.get(first.roomTypeId) : undefined;
    const ins = g.map((x) => x.checkIn).filter(Boolean) as Date[];
    const outs = g.map((x) => x.checkOut).filter(Boolean) as Date[];
    const checkIn = ins.length === g.length ? new Date(Math.min(...ins.map((d) => d.getTime()))) : null;
    const checkOut = outs.length === g.length ? new Date(Math.max(...outs.map((d) => d.getTime()))) : null;
    const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : null;
    if (type && g.length > type.capacity) issues.push({ severity: "error", code: "ACC_CAPACITY", department: "ACCOMMODATION", message: `Room ${first.roomLabel ?? key}: ${g.length} guests exceed ${type.name} capacity ${type.capacity}` });
    if (g.length > 1 && new Set(g.map((x) => x.roomTypeId)).size > 1) issues.push({ severity: "warning", code: "ACC_SHARED_TYPE_MISMATCH", department: "ACCOMMODATION", message: `Shared room ${first.roomLabel}: guests booked with different room types` });
    const cost = nights != null && type?.nightlyRate != null ? round(nights * type.nightlyRate, 2) : null;
    rooms.push({ key, hotelName: first.hotelId ? hotelName.get(first.hotelId) ?? null : null, roomType: type?.name ?? null, capacity: type?.capacity ?? null, guests: g.map((x) => x.guestName ?? "(unnamed)"), checkIn, checkOut, nights, nightlyRate: type?.nightlyRate ?? null, currency: type?.currency ?? "EGP", cost, status: g.every((x) => x.bookingStatus === "CONFIRMED") ? "CONFIRMED" : g.some((x) => x.bookingStatus === "CANCELLED") ? "CANCELLED" : "PENDING" });
  }
  // room availability per type and night
  const perType = new Map<string, number>();
  rooms.forEach((r) => { const id = list.find((a) => r.guests.includes(a.guestName ?? "(unnamed)"))?.roomTypeId; if (id) perType.set(id, (perType.get(id) ?? 0) + 1); });
  for (const [id, n] of perType) {
    const t = rt.get(id);
    if (t?.roomsAvailable != null && n > t.roomsAvailable) issues.push({ severity: "error", code: "ACC_AVAILABILITY", department: "ACCOMMODATION", message: `${t.hotelName} ${t.name}: ${n} rooms needed, ${t.roomsAvailable} available` });
  }
  const roomNights = rooms.reduce((s, r) => s + (r.nights ?? 0), 0);
  const costByCurrency: Record<string, number> = {};
  rooms.forEach((r) => { if (r.cost != null) costByCurrency[r.currency] = round((costByCurrency[r.currency] ?? 0) + r.cost, 2); });
  const traces = [trace({
    engine: "accommodation.rooming", title: "Rooming & room nights",
    formula: "Rooms = guests grouped by shared-room label; Room nights = Σ (check-out − check-in) days; Cost = nights × nightly rate",
    inputs: { guests: list.length, hotels: hotels.map((h) => h.name) },
    outputs: { rooms: rooms.length, roomNights, costByCurrency },
    assumptions: ["A shared room spans the earliest check-in to the latest check-out of its guests", "Rates are per room per night as quoted (taxes as per quotation)"],
    units: "room nights", state: rooms.some((r) => r.nights == null) ? "NEEDS_INFORMATION" : "CALCULATED",
  })];
  return { rooms, roomCount: rooms.length, roomNights, guestCount: list.length, costByCurrency, unconfirmed: list.filter((a) => a.bookingStatus !== "CONFIRMED").length, traces, issues };
}
