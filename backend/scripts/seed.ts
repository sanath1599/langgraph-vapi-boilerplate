import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/utils/phone";
import { hashPassword } from "../src/utils/auth";
import { config } from "../src/config";

const prisma = new PrismaClient();

const ORG_TZ = "America/New_York";

/** True if (year, month 1-12, day) is in DST in America/New_York (US rules: 2nd Sun Mar – 1st Sun Nov). */
function isDSTAmericaNewYork(year: number, month: number, day: number): boolean {
  const marchSecondSunday = (() => {
    let d = new Date(Date.UTC(year, 2, 1, 12, 0, 0));
    let sundays = 0;
    for (let i = 1; i <= 31; i++) {
      d.setUTCDate(i);
      if (d.getUTCDay() === 0) {
        sundays++;
        if (sundays === 2) return i;
      }
    }
    return 14;
  })();
  const novFirstSunday = (() => {
    let d = new Date(Date.UTC(year, 10, 1, 12, 0, 0));
    for (let i = 1; i <= 7; i++) {
      d.setUTCDate(i);
      if (d.getUTCDay() === 0) return i;
    }
    return 1;
  })();
  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  if (month === 3) return day >= marchSecondSunday;
  return day < novFirstSunday;
}

/** Return UTC Date for (year, month, day) at local hour (0–23) in America/New_York. */
function localTimeNYToUtc(year: number, month: number, day: number, hour: number): Date {
  const offset = isDSTAmericaNewYork(year, month, day) ? 4 : 5;
  const utcHour = hour + offset;
  return new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0, 0));
}

async function main() {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const organization = await prisma.organization.upsert({
    where: { id: 1 },
    create: {
      name: "Main Street Office",
      timezone: "America/New_York",
      acceptingBookings: true,
      minDaysInAdvance: 0,
      maxDaysInAdvance: 90,
      workingHours: JSON.stringify({
        mon: { start: "09:00", end: "17:00" },
        tue: { start: "09:00", end: "17:00" },
        wed: { start: "09:00", end: "17:00" },
        thu: { start: "09:00", end: "17:00" },
        fri: { start: "09:00", end: "17:00" },
      }),
      allowedVisitTypes: JSON.stringify(["new_visit", "follow_up", "consultation"]),
    },
    update: {},
  });

  const providers = await Promise.all([
    prisma.provider.upsert({
      where: { id: 1 },
      create: { organizationId: organization.id, name: "Jane Smith", specialty: "General", language: "en", gender: "female", active: true },
      update: {},
    }),
    prisma.provider.upsert({
      where: { id: 2 },
      create: { organizationId: organization.id, name: "John Doe", specialty: "Consulting", language: "en", gender: "male", active: true },
      update: {},
    }),
    prisma.provider.upsert({
      where: { id: 3 },
      create: { organizationId: organization.id, name: "Maria Garcia", specialty: "Support", language: "es", gender: "female", active: true },
      update: {},
    }),
  ]);

  const phone1 = normalizePhone("+1-408-622-1881", config.defaultCountry).normalizedNumber;
  const phone2 = normalizePhone("+1-555-987-6543", config.defaultCountry).normalizedNumber;
  const phone3 = normalizePhone("+1-555-111-2222", config.defaultCountry).normalizedNumber;
  const phone4 = normalizePhone("+16465174257", config.defaultCountry).normalizedNumber;

  const users = await Promise.all([
    prisma.user.upsert({
      where: { memberId: "MEMBER-SEED-001" },
      create: {
        firstName: "Sanath",
        lastName: "Mulky",
        dob: "1999-03-15",
        gender: "male",
        status: "active",
        memberId: "MEMBER-SEED-001",
        email: "alice@example.com",
        phone: phone1,
      },
      update: { phone: phone1 },
    }),
    prisma.user.upsert({
      where: { memberId: "MEMBER-SEED-002" },
      create: {
        firstName: "Bob",
        lastName: "Williams",
        dob: "1985-11-20",
        gender: "male",
        status: "active",
        memberId: "MEMBER-SEED-002",
        email: "bob@example.com",
        phone: phone2,
      },
      update: { phone: phone2 },
    }),
    prisma.user.upsert({
      where: { memberId: "MEMBER-SEED-003" },
      create: {
        firstName: "Carol",
        lastName: "Brown",
        dob: "1978-03-08",
        gender: "female",
        status: "active",
        memberId: "MEMBER-SEED-003",
        phone: phone3,
      },
      update: { phone: phone3 },
    }),
    prisma.user.upsert({
      where: { memberId: "MEMBER-SEED-004" },
      create: {
        firstName: "Pawan",
        lastName: "Khatri",
        dob: "1990-01-01",
        gender: "male",
        status: "active",
        memberId: "MEMBER-SEED-004",
        email: "pawan@example.com",
        phone: phone4,
      },
      update: { phone: phone4 },
    }),
  ]);

  const now = new Date();
  const nyTodayStr = new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TZ }).format(now);
  const [nyY, nyM, nyD] = nyTodayStr.split("-").map(Number);

  const allSlotsByDay = new Map<string, { organizationId: number; providerId: number; start: Date; end: Date; visitType: string }[]>();
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(Date.UTC(nyY, nyM - 1, nyD));
    d.setUTCDate(d.getUTCDate() + offset);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const daySlots: { organizationId: number; providerId: number; start: Date; end: Date; visitType: string }[] = [];
    for (const provider of providers) {
      for (let h = 9; h < 17; h++) {
        const start = localTimeNYToUtc(y, m, day, h);
        const end = localTimeNYToUtc(y, m, day, h + 1);
        daySlots.push({
          organizationId: organization.id,
          providerId: provider.id,
          start,
          end,
          visitType: "follow_up",
        });
      }
    }
    allSlotsByDay.set(dayKey, daySlots);
  }
  const slots: { organizationId: number; providerId: number; start: Date; end: Date; visitType: string }[] = [];
  for (const daySlots of allSlotsByDay.values()) {
    const shuffled = [...daySlots].sort(() => Math.random() - 0.5);
    slots.push(...shuffled.slice(0, 3));
  }
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());

  await prisma.availabilitySlot.deleteMany({});
  for (const s of slots) {
    await prisma.availabilitySlot.create({
      data: { ...s, isBooked: false },
    });
  }

  const slotList = await prisma.availabilitySlot.findMany({
    where: { isBooked: false, start: { gte: now } },
    orderBy: { start: "asc" },
    take: 10,
  });

  await prisma.appointment.deleteMany({});
  if (slotList.length >= 2) {
    const app = await prisma.appointment.create({
      data: {
        userId: users[0].id,
        organizationId: organization.id,
        providerId: providers[0].id,
        visitType: "follow_up",
        start: slotList[0].start,
        end: slotList[0].end,
        status: "booked",
        channel: "phone-bot",
      },
    });
    await prisma.availabilitySlot.update({
      where: { id: slotList[0].id },
      data: { isBooked: true, appointmentId: app.id },
    });
  }

  const adminHash = await hashPassword(config.defaultAdminPassword);
  await prisma.adminUser.upsert({
    where: { username: config.defaultAdminUsername },
    create: {
      username: config.defaultAdminUsername,
      passwordHash: adminHash,
    },
    update: { passwordHash: adminHash },
  });

  console.log("Seed complete: organization, providers, users, slots, appointments, default admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
