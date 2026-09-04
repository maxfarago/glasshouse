import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derive } from "./derive.ts";
import { deviceFamily } from "./device-family.ts";
import { collectT1 } from "./collect.ts";

describe("deviceFamily", () => {
  it("buckets a 14-class macbook without naming a year", () => {
    assert.equal(deviceFamily({ w: 1512, h: 982 }, 2, 0), "MacBook Pro 14 class");
  });

  it("buckets an iphone class", () => {
    assert.equal(deviceFamily({ w: 393, h: 852 }, 3, 5), "iPhone 14/15/16 class");
  });
});

describe("derive", () => {
  it("labels mullvad as datacenter and counts empty privacy signals", () => {
    const out = derive(
      {
        "sig.edge.as_org": "Mullvad VPN",
        "sig.client.screen": { w: 1440, h: 900 },
        "sig.client.dpr": 2,
        "sig.client.max_touch": 0,
        "sig.client.timezone": "Europe/Amsterdam",
        "sig.client.canvas_hash": null,
        "sig.client.fonts.count": 0,
      },
      { now: new Date("2026-09-04T12:00:00Z") },
    );
    assert.equal(out["sig.derived.asn_type"], "datacenter");
    assert.equal(out["sig.derived.device_family"], "desktop 1440 class");
    assert.ok((out["sig.derived.privacy_posture"] as number) >= 3);
    const time = out["sig.derived.local_time"] as { weekday: string; hour: number };
    assert.equal(time.weekday, "Friday");
    assert.equal(time.hour, 14);
  });
});

describe("collectT1", () => {
  it("reads a host without touching globals", () => {
    const signals = collectT1({
      screen: { width: 800, height: 600 },
      devicePixelRatio: 1,
      maxTouchPoints: 0,
      languages: ["en"],
      timeZone: "UTC",
      matchMedia: () => ({ matches: false }),
    });
    assert.deepEqual(signals["sig.client.screen"], { w: 800, h: 600 });
    assert.equal(signals["sig.client.prefers_reduced_motion"], false);
  });
});
