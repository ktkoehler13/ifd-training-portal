import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatEntryDate, formatEntryTime, parseEntryDate, parseEntryTime } from "./entry-format";

const TODAY = "2026-11-22";

describe("compensation date entry", () => {
  it("reads common typed dates as the same day", () => {
    for (const text of ["11/7/26", "11/07/2026", "11-7-26", "11.07.2026", " 11 / 7 / 2026 ", "110726", "11072026", "2026-11-07", "11/7"]) {
      assert.equal(parseEntryDate(text, TODAY), "2026-11-07", text);
    }
  });
  it("rejects impossible or unclear dates", () => {
    for (const text of ["", "13/1/26", "2/30/26", "11/7/202", "abc", "1172026", "11/7/26/1"]) {
      assert.equal(parseEntryDate(text, TODAY), null, text);
    }
    assert.equal(parseEntryDate("2/29/28", TODAY), "2028-02-29");
  });
  it("shows stored dates as MM/DD/YYYY", () => {
    assert.equal(formatEntryDate("2026-11-07"), "11/07/2026");
    assert.equal(formatEntryDate(""), "");
  });
});

describe("compensation time entry", () => {
  it("reads military time", () => {
    const cases: Record<string, string> = { "1300": "13:00", "13:00": "13:00", "0830": "08:30", "830": "08:30", "13": "13:00", "0": "00:00", "2359": "23:59", "1:00": "01:00" };
    for (const [text, expected] of Object.entries(cases)) assert.equal(parseEntryTime(text), expected, text);
  });
  it("reads AM/PM time", () => {
    const cases: Record<string, string> = { "1:00 PM": "13:00", "1pm": "13:00", "1:00p": "13:00", "8:30 a.m.": "08:30", "12am": "00:00", "12:15 PM": "12:15", "1230pm": "12:30" };
    for (const [text, expected] of Object.entries(cases)) assert.equal(parseEntryTime(text), expected, text);
  });
  it("rejects invalid times", () => {
    for (const text of ["", "2400", "1360", "13pm", "0am", "12345", "1:0", "noon"]) assert.equal(parseEntryTime(text), null, text);
  });
  it("shows stored times with AM/PM", () => {
    assert.equal(formatEntryTime("13:00"), "1:00 PM");
    assert.equal(formatEntryTime("00:05"), "12:05 AM");
    assert.equal(formatEntryTime("12:00"), "12:00 PM");
    assert.equal(formatEntryTime("08:30"), "8:30 AM");
    assert.equal(formatEntryTime(""), "");
  });
});
