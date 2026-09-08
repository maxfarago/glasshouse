import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derive } from "@glasshouse/signals";
import { detectTells, stripTellsForInfer, tellsForInfer } from "./detect.ts";
import type { SignalSet } from "@glasshouse/schema";

const NOW = { now: new Date("2026-09-04T12:00:00Z") };

function ids(s: SignalSet): string[] {
  return detectTells(derive(s, NOW)).map((t) => t.id).sort();
}

describe("detectTells", () => {
  it("is stable on an identical set", () => {
    const s = derive(
      {
        "sig.edge.as_org": "Ziggo",
        "sig.edge.geo.country": "NL",
        "sig.client.prefers_reduced_motion": false,
      },
      NOW,
    );
    assert.deepEqual(detectTells(s), detectTells(s));
  });

  it("does not treat mullvad ny as a person-region contradict", () => {
    const got = ids({
      "sig.edge.as_org": "Mullvad VPN",
      "sig.edge.geo.country": "US",
      "sig.edge.geo.city": "New York",
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.canvas_hash": "abc",
      "sig.client.audio_hash": "def",
      "sig.client.fonts.count": 12,
      "sig.client.webgl_renderer": "Apple",
      "sig.client.screen": { w: 1440, h: 900 },
      "sig.client.dpr": 2,
      "sig.client.max_touch": 0,
    });
    assert.ok(got.includes("evasion_incomplete"));
    assert.ok(!got.includes("advertised_exit"));
    assert.ok(!got.includes("timezone_vs_geo"));
    assert.ok(!got.includes("install_vs_geo"));
    assert.ok(!got.includes("path_vs_body"));
    assert.ok(!got.includes("client_suppression"));
  });

  it("splits mullvad+brave into suppression plus advertised exit", () => {
    const got = ids({
      "sig.edge.as_org": "Mullvad VPN",
      "sig.edge.geo.country": "US",
      "sig.edge.geo.city": "New York",
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.canvas_hash": null,
      "sig.client.audio_hash": null,
      "sig.client.fonts.count": 0,
      "sig.client.webgl_renderer": "Google SwiftShader",
      "sig.client.intl.first_day": 1,
      "sig.client.screen": { w: 1440, h: 900 },
      "sig.client.dpr": 2,
      "sig.client.max_touch": 0,
    });
    assert.ok(got.includes("client_suppression"));
    assert.ok(got.includes("advertised_exit"));
    assert.ok(!got.includes("evasion_incomplete"));
  });

  it("fires suppression alone on residential brave", () => {
    const got = ids({
      "sig.edge.as_org": "Ziggo",
      "sig.edge.geo.country": "NL",
      "sig.client.canvas_hash": null,
      "sig.client.audio_hash": null,
      "sig.client.fonts.count": 0,
      "sig.client.webgl_renderer": "Google SwiftShader",
      "sig.client.intl.first_day": 7,
    });
    assert.ok(got.includes("client_suppression"));
    assert.ok(!got.includes("advertised_exit"));
    assert.ok(!got.includes("evasion_incomplete"));
  });

  it("does not fire suppression or advertised_exit on relay lockdown without intl or city", () => {
    const got = ids({
      "sig.edge.as_org": "Apple iCloud Private Relay",
      "sig.edge.geo.country": "NL",
      "sig.edge.geo.city": null,
      "sig.client.canvas_hash": null,
      "sig.client.audio_hash": null,
      "sig.client.fonts.count": 0,
      "sig.client.webgl_renderer": "Apple GPU",
    });
    assert.ok(!got.includes("client_suppression"));
    assert.ok(!got.includes("advertised_exit"));
    assert.ok(!got.includes("evasion_incomplete"));
  });

  it("fires install_vs_geo on sunday-first plus imperial against nl", () => {
    const got = ids({
      "sig.edge.as_org": "Ziggo",
      "sig.edge.geo.country": "NL",
      "sig.edge.geo.city": "Amsterdam",
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.intl.first_day": 7,
      "sig.client.intl.hour_cycle": "h12",
      "sig.client.intl.measurement": "imperial",
      "sig.client.canvas_hash": "x",
      "sig.client.audio_hash": "y",
      "sig.client.fonts.count": 8,
      "sig.client.webgl_renderer": "Apple",
    });
    assert.ok(got.includes("install_vs_geo"));
    assert.ok(!got.includes("timezone_vs_geo"));
  });

  it("does not dump the sunday-first iso list when the set is large", () => {
    const tells = detectTells(
      derive(
        {
          "sig.edge.as_org": "Ziggo",
          "sig.edge.geo.country": "NL",
          "sig.edge.geo.city": "Amsterdam",
          "sig.client.timezone": "Europe/Amsterdam",
          "sig.client.intl.first_day": 7,
        },
        NOW,
      ),
    );
    const hit = tells.find((t) => t.id === "install_vs_geo");
    assert.ok(hit);
    assert.match(hit.detail, /Sunday-first set, \d+ countries/);
    assert.ok(!hit.detail.includes("AR, BO"));
  });

  it("maps sf mono without mapping menlo", () => {
    const tells = detectTells(
      derive(
        {
          "sig.client.fonts.probe_hits": ["Menlo", "SF Mono"],
        },
        NOW,
      ),
    );
    const sw = tells.find((t) => t.id === "software_from_font");
    assert.ok(sw);
    assert.match(sw.headline, /Apple Developer Tools/);
    assert.ok(!sw.headline.includes("Menlo"));
  });

  it("fires path_vs_body on desktop plus mobile asn, not on datacenter", () => {
    const mixed = ids({
      "sig.edge.as_org": "KPN Mobiel",
      "sig.client.screen": { w: 1512, h: 982 },
      "sig.client.dpr": 2,
      "sig.client.max_touch": 0,
    });
    assert.ok(mixed.includes("path_vs_body"));
  });

  it("fires ua_vs_gpu on windows ua plus apple gpu", () => {
    const got = ids({
      "sig.hdr.ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "sig.client.webgl_vendor": "Google Inc. (Apple)",
      "sig.client.webgl_renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M-class)",
    });
    assert.ok(got.includes("ua_vs_gpu"));
  });

  it("does not fire ua_vs_gpu on mac plus apple gpu", () => {
    const got = ids({
      "sig.hdr.ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "sig.client.webgl_vendor": "Google Inc. (Apple)",
      "sig.client.webgl_renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M-class)",
    });
    assert.ok(!got.includes("ua_vs_gpu"));
  });

  it("fires withheld when accessibility signals are present, and strips them for infer", () => {
    const tells = detectTells(
      derive({ "sig.client.prefers_reduced_motion": false }, NOW),
    );
    assert.ok(tells.some((t) => t.id === "withheld"));
    assert.ok(!stripTellsForInfer(tells).some((t) => t.category === "withheld"));
  });

  it("does not fire withheld when those keys are absent", () => {
    const got = ids({ "sig.client.timezone": "Europe/Amsterdam" });
    assert.ok(!got.includes("withheld"));
  });

  it("fires intl_vs_ui_locale when locale region is outside the install set", () => {
    const got = ids({
      "sig.client.langs": ["en-GB"],
      "sig.client.intl.first_day": 7,
      "sig.client.intl.hour_cycle": "h12",
      "sig.client.intl.measurement": "imperial",
      "sig.edge.as_org": "Ziggo",
      "sig.edge.geo.country": "NL",
    });
    assert.ok(got.includes("intl_vs_ui_locale"));
  });

  it("tellsForInfer prefixes ids and drops withheld", () => {
    const payload = tellsForInfer(detectTells(derive({ "sig.client.prefers_reduced_motion": false }, NOW)));
    assert.ok(payload.every((t) => t.id.startsWith("tell.")));
    assert.ok(!payload.some((t) => t.id === "tell.withheld"));
  });

  it("fires blocker_vs_fp only when bait is hidden and collectors are intact", () => {
    const intact = ids({
      "sig.client.blocker.present": true,
      "sig.client.canvas_hash": "abc",
      "sig.client.audio_hash": "def",
      "sig.client.fonts.count": 12,
      "sig.client.webgl_renderer": "Apple",
      "sig.client.intl.calendar": "gregory",
      "sig.client.intl.numbering": "latn",
      "sig.client.intl.first_day": 1,
    });
    assert.ok(intact.includes("blocker_vs_fp"));
    const emptied = ids({
      "sig.client.blocker.present": true,
      "sig.client.canvas_hash": null,
      "sig.client.audio_hash": null,
      "sig.client.fonts.count": 0,
      "sig.client.intl.calendar": "gregory",
    });
    assert.ok(!emptied.includes("blocker_vs_fp"));
  });

  it("fires high_refresh at 120 and not at 60", () => {
    assert.ok(
      ids({ "sig.client.screen.refresh_hz": 120, "sig.client.css.update": "fast" }).includes("high_refresh"),
    );
    assert.ok(!ids({ "sig.client.screen.refresh_hz": 60, "sig.client.css.update": "fast" }).includes("high_refresh"));
  });
});
