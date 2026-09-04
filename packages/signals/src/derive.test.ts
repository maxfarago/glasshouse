import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derive } from "./derive.ts";
import { deviceFamily } from "./device-family.ts";
import { collectT1, collectT2 } from "./collect.ts";
import { FONT_PROBE } from "./fonts-probe.ts";

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
    assert.equal(out["sig.derived.net_vs_tz"], "geo_absent");
    const time = out["sig.derived.local_time"] as { weekday: string; hour: number };
    assert.equal(time.weekday, "Friday");
    assert.equal(time.hour, 14);
  });

  it("marks mullvad us-exit vs amsterdam tz as contradict", () => {
    const out = derive(
      {
        "sig.edge.as_org": "Mullvad VPN",
        "sig.edge.geo.country": "US",
        "sig.edge.geo.city": "New York",
        "sig.client.timezone": "Europe/Amsterdam",
      },
      { now: new Date("2026-09-04T12:00:00Z") },
    );
    assert.equal(out["sig.derived.net_vs_tz"], "contradict");
  });

  it("marks residential amsterdam as agree", () => {
    const out = derive(
      {
        "sig.edge.as_org": "Ziggo",
        "sig.edge.geo.country": "NL",
        "sig.edge.geo.city": "Amsterdam",
        "sig.client.timezone": "Europe/Amsterdam",
      },
      { now: new Date("2026-09-04T12:00:00Z") },
    );
    assert.equal(out["sig.derived.net_vs_tz"], "agree");
  });

  it("omits net_vs_tz until a timezone exists", () => {
    const out = derive(
      {
        "sig.edge.as_org": "Ziggo",
        "sig.edge.geo.country": "NL",
        "sig.edge.geo.city": "Amsterdam",
      },
      { now: new Date("2026-09-04T12:00:00Z") },
    );
    assert.equal(out["sig.derived.net_vs_tz"], undefined);
    assert.equal(out["sig.derived.local_time"], undefined);
  });

  it("marks private relay with a matching country as geo_absent", () => {
    const out = derive(
      {
        "sig.edge.as_org": "Apple iCloud Private Relay",
        "sig.edge.geo.country": "NL",
        "sig.edge.geo.city": null,
        "sig.client.timezone": "Europe/Amsterdam",
      },
      { now: new Date("2026-09-04T12:00:00Z") },
    );
    assert.equal(out["sig.derived.asn_type"], "datacenter");
    assert.equal(out["sig.derived.net_vs_tz"], "geo_absent");
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
      matchMedia: (q) => ({
        matches:
          q === "(pointer: fine)" ||
          q === "(any-pointer: fine)" ||
          q === "(hover: hover)" ||
          q === "(color-gamut: p3)",
      }),
    });
    assert.deepEqual(signals["sig.client.screen"], { w: 800, h: 600 });
    assert.equal(signals["sig.client.prefers_reduced_motion"], false);
    assert.equal(signals["sig.client.css.pointer"], "fine");
    assert.equal(signals["sig.client.css.any_pointer"], "fine");
    assert.equal(signals["sig.client.css.hover"], "hover");
    assert.equal(signals["sig.client.css.color_gamut"], "p3");
    assert.equal(signals["sig.client.css.forced_colors"], null);
  });
});

describe("collectT2", () => {
  it("assembles sync probes from a host", () => {
    const signals = collectT2({
      canvasHash: () => "abcd",
      webgl: () => ({
        vendor: "Apple",
        renderer: "Apple M-class",
        extHash: "deadbeef",
        maxTexture: 16384,
        precision: 23,
        webgl2: true,
      }),
      audioHash: () => "audio",
      fonts: () => ({ count: 2, notable: ["Menlo"], probeHits: ["SF Mono"] }),
      intl: () => ({
        calendar: "gregory",
        numbering: "latn",
        firstDay: 1,
        weekend: [6, 7],
        tzCount: 418,
      }),
      devices: () => ["audioinput", "audiooutput", "videoinput"],
      netinfo: () => ({ effectiveType: "4g", rtt: 50, downlink: 10, saveData: false }),
    });
    assert.equal(signals["sig.client.webgl.ext_hash"], "deadbeef");
    assert.equal(signals["sig.client.webgl2_available"], true);
    assert.deepEqual(signals["sig.client.fonts.probe_hits"], ["SF Mono"]);
    assert.equal(signals["sig.client.intl.first_day"], 1);
    assert.deepEqual(signals["sig.client.devices.kinds"], ["audioinput", "audiooutput", "videoinput"]);
    assert.equal(signals["sig.client.netinfo.effective_type"], "4g");
  });
});

describe("FONT_PROBE", () => {
  it("is a closed list of software tells", () => {
    assert.equal(FONT_PROBE.length, 30);
  });
});
