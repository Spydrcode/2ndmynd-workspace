import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { bandByQuantiles, volatilityBand } from "./bucketing";
import { SnapshotV1 } from "./transformer_types";

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

function findFirstCsv(root: string) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFirstCsv(fullPath);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      return fullPath;
    }
  }
  return null;
}

function dayOfWeekCounts(dates: Date[]) {
  const counts = Array(7).fill(0);
  for (const date of dates) {
    counts[date.getUTCDay()] += 1;
  }
  return counts;
}

export function transformNoshowAppointments(datasetPath: string): SnapshotV1[] {
  if (!fs.existsSync(datasetPath)) {
    console.warn(`missing noshowappointments input at ${datasetPath}`);
    return [];
  }

  const inputPath = fs.statSync(datasetPath).isDirectory()
    ? findFirstCsv(datasetPath)
    : datasetPath;
  if (!inputPath) {
    console.warn(`no csv found under ${datasetPath}`);
    return [];
  }

  const rows = readCsv(inputPath);
  const leadTimes: number[] = [];
  const appointmentDates: Date[] = [];
  const noShowFlags: number[] = [];

  for (const row of rows) {
    const scheduled = parseDate(row.ScheduledDay ?? row.ScheduledDate ?? row["ScheduledDay"]);
    const appointment = parseDate(row.AppointmentDay ?? row.AppointmentDate ?? row["AppointmentDay"]);
    if (scheduled && appointment) {
      leadTimes.push((appointment.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24));
      appointmentDates.push(appointment);
    }
    const noShow = String(row["No-show"] ?? row.NoShow ?? row.no_show ?? "").toLowerCase();
    if (noShow) {
      noShowFlags.push(noShow === "yes" ? 1 : 0);
    }
  }

  const leadTimeBand = bandByQuantiles(leadTimes);
  const noShowRate =
    noShowFlags.length > 0
      ? noShowFlags.reduce((sum, v) => sum + v, 0) / noShowFlags.length
      : 0;
  const noShowBand = noShowRate > 0.2 ? "high" : noShowRate > 0.1 ? "medium" : "low";
  const dowCounts = dayOfWeekCounts(appointmentDates);
  const volatility = volatilityBand(dowCounts);
  const rescheduleBand =
    noShowRate > 0.2 || leadTimeBand === "high"
      ? "high"
      : noShowRate > 0.1
      ? "medium"
      : "low";

  const snapshot: SnapshotV1 = {
    snapshot_version: "snapshot_v1",
    pii_scrubbed: true,
    signals: {
      "schedule.lead_time_p90.band": leadTimeBand,
      "schedule.no_show_rate.band": noShowBand,
      "schedule.reschedule_pressure.band": rescheduleBand,
      "schedule.volatility.band": volatility,
    },
  };

  return [snapshot];
}
