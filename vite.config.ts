import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

interface NormPlane {
  lon: number;
  lat: number;
  v: number; // m/s
  hdg: number; // deg
  alt: number; // m
  callsign: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Dev-server endpoint /aircraft?lamin&lomin&lamax&lomax → normalized aircraft.
// Uses OpenSky (OAuth client-credentials) when keys are set, else adsb.lol.
function aircraftPlugin(env: Record<string, string>): Plugin {
  const ID = env.OPENSKY_CLIENT_ID;
  const SECRET = env.OPENSKY_CLIENT_SECRET;
  let token = "";
  let tokenExp = 0;

  async function getToken(): Promise<string> {
    if (token && Date.now() < tokenExp) return token;
    const res = await fetch(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: ID,
          client_secret: SECRET,
        }),
      },
    );
    if (!res.ok) throw new Error("opensky token " + res.status);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = j.access_token;
    tokenExp = Date.now() + (j.expires_in - 60) * 1000;
    return token;
  }

  return {
    name: "aircraft-proxy",
    configureServer(server) {
      server.middlewares.use("/aircraft", async (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        try {
          const u = new URL(req.url ?? "", "http://x");
          const lamin = Number(u.searchParams.get("lamin"));
          const lomin = Number(u.searchParams.get("lomin"));
          const lamax = Number(u.searchParams.get("lamax"));
          const lomax = Number(u.searchParams.get("lomax"));

          let aircraft: NormPlane[] = [];

          if (ID && SECRET) {
            const tok = await getToken();
            const r = await fetch(
              `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`,
              { headers: { Authorization: "Bearer " + tok } },
            );
            if (!r.ok) return send(r.status, { error: "opensky " + r.status });
            const d = (await r.json()) as {
              states?: Array<Array<number | string | boolean | null>>;
            };
            aircraft = (d.states ?? [])
              .filter((s) => s[5] != null && s[6] != null && !s[8])
              .map((s) => ({
                lon: s[5] as number,
                lat: s[6] as number,
                v: (s[9] as number) ?? 0,
                hdg: (s[10] as number) ?? 0,
                alt: (s[13] ?? s[7] ?? 0) as number,
                callsign: ((s[1] as string) || "").trim() || (s[0] as string),
              }));
          } else {
            const latc = (lamin + lamax) / 2;
            const lonc = (lomin + lomax) / 2;
            const distNm = Math.min(
              250,
              Math.max(20, Math.round(haversineKm(latc, lonc, lamax, lomax) / 1.852)),
            );
            const r = await fetch(
              `https://api.adsb.lol/v2/lat/${latc.toFixed(3)}/lon/${lonc.toFixed(3)}/dist/${distNm}`,
            );
            if (!r.ok) return send(r.status, { error: "adsb " + r.status });
            const d = (await r.json()) as {
              ac?: Array<{
                lat?: number;
                lon?: number;
                gs?: number;
                track?: number;
                mag_heading?: number;
                alt_baro?: number | string;
                flight?: string;
                hex?: string;
              }>;
            };
            aircraft = (d.ac ?? [])
              .filter(
                (a) =>
                  typeof a.lat === "number" &&
                  typeof a.lon === "number" &&
                  a.alt_baro !== "ground",
              )
              .map((a) => ({
                lon: a.lon as number,
                lat: a.lat as number,
                v: (a.gs ?? 0) * 0.514444,
                hdg: a.track ?? a.mag_heading ?? 0,
                alt: (typeof a.alt_baro === "number" ? a.alt_baro : 0) * 0.3048,
                callsign: (a.flight ?? a.hex ?? "").trim(),
              }));
          }

          send(200, { aircraft });
        } catch (e) {
          send(502, { error: String(e) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), aircraftPlugin(env)],
  };
});
