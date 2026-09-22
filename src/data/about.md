> [!IMPORTANT] Disclaimer
> Beacon is an independent, non-commercial personal project. It is **not affiliated with, endorsed by, or sponsored by** BENECO (Benguet Electric Cooperative) or the University of the Cordilleras, and neither organization has reviewed or approved this site.
>
> Outage data is taken from BENECO's public channels and may be delayed, incomplete, or inaccurate. It is provided for informational purposes only and should not be relied on for safety or other critical decisions. For authoritative information, always check BENECO's [official website](https://beneco.com.ph/) or [Facebook page](https://www.facebook.com/benguetelectric).
>
> "BENECO" and other organization names are trademarks of their respective owners and are used here for identification only.

Beacon was the name of my group's capstone project at the University of the Cordilleras. For that project, BENECO was our industry partner. Benguet's electrical grid, including Baguio City, is managed by BENECO. In interviews with the cooperative, it was identified that their system's customer-facing side is lacking — the public can't easily see what an outage means for their area.

This site is my own version of that idea, rebuilt as a solo project to **make BENECO's outage data more accessible and easier to understand**. The name carried over — Beacon is just derived from BENECO.

## How it works

Every outage on the site goes through three steps:

1. **Collect** — pull outages (`all` or `scheduled`) from BENECO's public API for the period selected (`today`, `this_week`, and `last_week`).
2. **Resolve** — a LLM reads each written affected area and maps it into cities and barangays (with their respective `id` and `pcode`), choosing only from BENECO's actual service area and keeping anything it can't place as `unresolved`.
3. **Display** — shade the affected barangays, municipalities, and provinces on the map, and list the same outages by status: `ongoing`, `scheduled`, `cancelled`, and `restored`.