# Beacon

> Disclaimer
> 
> Beacon is not affiliated with BENECO or the University of the Cordilleras.

## Overview

Beacon was the name of my group's capstone project at the University of the Cordilleras. For that project, BENECO (Benguet Electric Cooperative) was our industry partner. Benguet's electrical grid, including Baguio City, is managed by BENECO. In interviews with the cooperative, they mentioned that one of the gaps in their systems is on the customer-facing side — the public can't easily see what an outage means for their area.

The site is my own version of that idea, rebuilt as a solo project to **make BENECO's outage data more accessible and easier to understand**. The name carried over — Beacon is just derived from BENECO.

## How it works

Every outage on the site goes through three steps:

1. **Collect** — pull outages (`all` or `scheduled`) from BENECO's public API for the period selected (`today`, `this_week`, and `last_week`).
2. **Resolve** — a LLM reads each written affected area and maps it into cities and barangays (with their respective `id` and `pcode`), choosing only from BENECO's actual service area and keeping anything it can't place as `unresolved`.
3. **Display** — shade the affected barangays, municipalities, and provinces on the map, and list the same outages by status: `ongoing`, `scheduled`, `cancelled`, and `restored`.

## See the resolver in action

One real BENECO advisory, and the structured areas Beacon extracts from its free-text description.

### Raw advisory

What BENECO's API returns for one unscheduled outage. Everything the resolver needs lives inside the `area` string.

```ts
const rawOutage = {
  id: 68090,
  feeder: "Feeder 5A",
  area: "Baguio City: (parts of Bonifacio Rd. from Rex Hall), parts of Upper General Luna (along Laurel St. near BLET), Kabayanihan, Session Road (left-side going up, Upper Mabini, Assumption Rd., University of Baguio, BBCCCI, Porta Vaga, Post Office Loop, Cathedral, Barrio Fiesta, NBI), Salud Mitra (including Happy Glen Loop and Jungle Town), Lower General Luna (including SLU-LES, Notre Dame Hospital New and Old)",
  cause: "Repair and maintenance of cut high voltage line.",
  timeoff: "2026-09-03 18:44:31",
  timerestored: "2026-09-03 18:48:44",
  duration: "4Mins, 13Secs",
  status: "Restored",
  legacy_photos: [],
  latest_update: null,
  updates: [],
};
```

### Resolved areas

The resolver's output: each barangay gets a scope (whole vs. included areas) and a confidence. Here, nothing is left `unresolved`.

```json
{
  "unresolved": [],
  "municipalities": [
    {
      "id": 2,
      "name": "BAGUIO CITY",
      "scope": {
        "kind": "included",
        "barangays": [
          {
            "id": 18,
            "name": "Andres Bonifacio",
            "pcode": "PH1401102117",
            "scope": {
              "kind": "included",
              "areas": [
                "Bonifacio Rd. from Rex Hall"
              ]
            },
            "confidence": "medium"
          },
          {
            "id": 256,
            "name": "Upper General Luna",
            "pcode": "PH1401102038",
            "scope": {
              "kind": "included",
              "areas": [
                "along Laurel St. near BLET"
              ]
            },
            "confidence": "high"
          },
          {
            "id": 126,
            "name": "Kabayanihan",
            "pcode": "PH1401102142",
            "scope": {
              "kind": "whole"
            },
            "confidence": "high"
          },
          {
            "id": 221,
            "name": "Session Road",
            "pcode": "PH1401102106",
            "scope": {
              "kind": "included",
              "areas": [
                "left-side going up",
                "Upper Mabini",
                "Assumption Rd.",
                "University of Baguio",
                "BBCCCI",
                "Porta Vaga",
                "Post Office Loop",
                "Cathedral",
                "Barrio Fiesta",
                "NBI"
              ]
            },
            "confidence": "high"
          },
          {
            "id": 212,
            "name": "Salud Mitra",
            "pcode": "PH1401102094",
            "scope": {
              "kind": "included",
              "areas": [
                "Happy Glen Loop",
                "Jungle Town"
              ]
            },
            "confidence": "high"
          },
          {
            "id": 145,
            "name": "Lower General Luna",
            "pcode": "PH1401102039",
            "scope": {
              "kind": "included",
              "areas": [
                "SLU-LES",
                "Notre Dame Hospital New and Old"
              ]
            },
            "confidence": "high"
          }
        ]
      },
      "confidence": "high"
    }
  ]
}
```
