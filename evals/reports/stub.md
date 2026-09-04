# stub

model_id: stub-v0
repeats: 3
fixtures: 3
mean_brier: 0.29

## summary

| fixture | source | claims | drops | hit_rate | brier | drop_rate | jaccard |
|---|---|---|---|---|---|---|---|
| ios-lockdown-empty | sanitized | 7 | 1 | 1.00 | 0.20 | 0.13 | 1.00 |
| macbook-chrome-home | sanitized | 8 | 1 | 1.00 | 0.33 | 0.11 | 1.00 |
| vpn-datacenter-mullvad | sanitized | 8 | 1 | 1.00 | 0.34 | 0.11 | 1.00 |

## reliability

| tier | n | hits | hit_rate |
|---|---|---|---|
| HUNCH | 4 | 4 | 1.00 |
| PLAUSIBLE | 10 | 10 | 1.00 |
| LIKELY | 7 | 7 | 1.00 |
| CONFIDENT | 0 | 0 | — |

## ios-lockdown-empty

source: sanitized
hit_rate: 1.00  brier: 0.20  drop_rate: 0.13  declined_rate: 0.40  jaccard: 1.00
behavior_sparse: false

### claims
- `location_region` PLAUSIBLE [hit] edge geo places them in nl
- `location_precision` HUNCH [unlabeled] only a country code is present; city is absent
- `connection_context` LIKELY [hit] connection looks datacenter (Apple Inc. iCloud Private Relay)
- `device_family` PLAUSIBLE [hit] hardware class is iphone 14/15/16 class
- `os_browser_posture` LIKELY [hit] ua reads as ios safari
- `privacy_posture` LIKELY [hit] the client returned 10 empty or generic signals; this looks like deliberate hardening, not a failed collect
- `language_profile` PLAUSIBLE [hit] accept/client languages are en

### drops
- `visit_intent` empty_evidence

### declined
- `age_cohort` no signal supports an age band
- `employment_sector` no employer-grade asn or rDNS
- `employer_or_org` no employer-grade asn or rDNS
- `residency_status` stub does not infer tenure or mobility
- `device_tier` stub does not price hardware
- `technical_sophistication` stub leaves sophistication to a real model

thin_signal_note: sparse input: most collectors returned null, generic, or randomized values

## macbook-chrome-home

source: sanitized
hit_rate: 1.00  brier: 0.33  drop_rate: 0.11  declined_rate: 0.40  jaccard: 1.00
behavior_sparse: false

### claims
- `location_region` LIKELY [hit] edge geo places them in amsterdam, nl
- `location_precision` PLAUSIBLE [hit] city is named (amsterdam); that is still a metro, not a building
- `connection_context` PLAUSIBLE [hit] connection looks residential, consistent with home or pocket rather than a hosted exit
- `time_context` HUNCH [hit] local time is friday 14:00 (Europe/Amsterdam), inside conventional work hours
- `device_family` PLAUSIBLE [hit] hardware class is macbook pro 14 class
- `os_browser_posture` LIKELY [hit] ua reads as mac chrome
- `privacy_posture` HUNCH [hit] almost every collector returned a value; this looks like default browser posture, not lockdown
- `language_profile` PLAUSIBLE [hit] accept/client languages are en-us, en, nl

### drops
- `visit_intent` empty_evidence

### declined
- `age_cohort` no signal supports an age band
- `employment_sector` no employer-grade asn or rDNS
- `employer_or_org` no employer-grade asn or rDNS
- `residency_status` stub does not infer tenure or mobility
- `device_tier` stub does not price hardware
- `technical_sophistication` stub leaves sophistication to a real model

## vpn-datacenter-mullvad

source: sanitized
hit_rate: 1.00  brier: 0.34  drop_rate: 0.11  declined_rate: 0.40  jaccard: 1.00
behavior_sparse: false

### claims
- `location_region` PLAUSIBLE [hit] visitor is more likely in the netherlands than in the advertised us exit city
- `location_precision` HUNCH [hit] city-level placement is not available; the edge city is an exit, not a person
- `connection_context` LIKELY [hit] vpn or datacenter exit: edge geo is us while the timezone is dutch
- `time_context` HUNCH [hit] local time is friday 14:00 (Europe/Amsterdam), inside conventional work hours
- `device_family` PLAUSIBLE [hit] hardware class is desktop 1440 class
- `os_browser_posture` LIKELY [hit] ua reads as mac chrome
- `privacy_posture` HUNCH [unlabeled] almost every collector returned a value; this looks like default browser posture, not lockdown
- `language_profile` PLAUSIBLE [hit] accept/client languages are nl-nl, nl, en

### drops
- `visit_intent` empty_evidence

### declined
- `age_cohort` no signal supports an age band
- `employment_sector` no employer-grade asn or rDNS
- `employer_or_org` no employer-grade asn or rDNS
- `residency_status` stub does not infer tenure or mobility
- `device_tier` stub does not price hardware
- `technical_sophistication` stub leaves sophistication to a real model
