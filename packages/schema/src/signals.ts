export const SIGNAL_TIERS = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;

export type SignalTier = (typeof SIGNAL_TIERS)[number];

export type SignalSource = SignalTier | "derived";

export const SIGNAL_REGISTRY = {
  "sig.edge.asn": "T0",
  "sig.edge.as_org": "T0",
  "sig.edge.geo.country": "T0",
  "sig.edge.geo.city": "T0",
  "sig.edge.geo.postal": "T0",
  "sig.edge.colo": "T0",
  "sig.edge.conn_type": "T0",
  "sig.edge.tcp_rtt_ms": "T0",
  "sig.edge.tls_version": "T0",
  "sig.edge.tls_cipher": "T0",
  "sig.edge.http_version": "T0",
  "sig.hdr.ua": "T0",
  "sig.hdr.accept_language": "T0",
  "sig.hdr.ua_ch_platform": "T0",
  "sig.hdr.ua_ch_mobile": "T0",
  "sig.hdr.referer": "T0",
  "sig.client.timezone": "T1",
  "sig.client.screen": "T1",
  "sig.client.dpr": "T1",
  "sig.client.langs": "T1",
  "sig.client.hw_concurrency": "T1",
  "sig.client.device_memory": "T1",
  "sig.client.max_touch": "T1",
  "sig.client.prefers_reduced_motion": "T1",
  "sig.client.prefers_color_scheme": "T1",
  "sig.client.css.forced_colors": "T1",
  "sig.client.css.inverted_colors": "T1",
  "sig.client.css.prefers_contrast": "T1",
  "sig.client.css.prefers_reduced_transparency": "T1",
  "sig.client.canvas_hash": "T2",
  "sig.client.webgl_vendor": "T2",
  "sig.client.webgl_renderer": "T2",
  "sig.client.fonts.count": "T2",
  "sig.client.fonts.notable": "T2",
  "sig.client.audio_hash": "T2",
  "sig.tls.ja4": "T3",
  "sig.tls.alpn": "T3",
  "sig.behav.pointer_jitter": "T4",
  "sig.behav.dwell_map": "T4",
  "sig.user.gps": "T5",
  "sig.user.gps_building": "T5",
  "sig.user.pwned_prefix": "T5",
  "sig.user.pwned_count": "T5",
  "sig.derived.device_family": "derived",
  "sig.derived.asn_type": "derived",
  "sig.derived.local_time": "derived",
  "sig.derived.privacy_posture": "derived",
} as const satisfies Record<string, SignalSource>;

export type SignalId = keyof typeof SIGNAL_REGISTRY;

export const SIGNAL_IDS = Object.keys(SIGNAL_REGISTRY) as SignalId[];

export function isSignalId(value: string): value is SignalId {
  return value in SIGNAL_REGISTRY;
}

export function sourceOf(id: SignalId): SignalSource {
  return SIGNAL_REGISTRY[id];
}

export type SignalValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | { w: number; h: number }
  | { lat: number; lon: number }
  | { timezone: string; weekday: string; hour: number; iso: string }
  | Record<string, number>;

export type SignalSet = Partial<Record<SignalId, SignalValue>>;
