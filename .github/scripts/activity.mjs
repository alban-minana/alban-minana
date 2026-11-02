// Renders assets/activity.svg: contribution totals, streaks and the last 30 days,
// in the same style as the banner. Run daily by .github/workflows/activity.yml.
import { writeFileSync } from "node:fs";

const USER = process.env.USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT ?? "assets/activity.svg";
const FONT = (w) => `https://unpkg.com/geist@1.9.0/dist/fonts/geist-sans/Geist-${w}.woff2`;

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const { user } = await gql(`query($l:String!){ user(login:$l){ createdAt } }`, { l: USER });
const now = new Date();
const days = [];
let total = 0;
for (let y = new Date(user.createdAt).getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
  const to = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
  const data = await gql(
    `query($l:String!,$f:DateTime!,$t:DateTime!){ user(login:$l){ contributionsCollection(from:$f,to:$t){
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`,
    { l: USER, f: `${y}-01-01T00:00:00Z`, t: to },
  );
  const cal = data.user.contributionsCollection.contributionCalendar;
  total += cal.totalContributions;
  for (const w of cal.weeks) for (const d of w.contributionDays) days.push(d);
}
days.sort((a, b) => a.date.localeCompare(b.date));

let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
let i = days.length - 1;
if (i >= 0 && days[i].contributionCount === 0) i--; // today may not have started yet
let current = 0;
for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
const last30 = days.slice(-30).map((d) => d.contributionCount);

const font64 = async (w) => Buffer.from(await (await fetch(FONT(w))).arrayBuffer()).toString("base64");
const [regular, medium] = await Promise.all([font64("Regular"), font64("Medium")]);

const W = 1280, H = 360, PAD = 56;
const fmt = (n) => n.toLocaleString("en-US");
const stats = [
  [fmt(total), "contributions"],
  [`${current} ${current === 1 ? "day" : "days"}`, "current streak"],
  [`${longest} days`, "longest streak"],
];
const colW = (W - PAD * 2) / 3;
const statsSvg = stats.map(([v, l], k) => `
  <text x="${PAD + k * colW}" y="118" class="num">${v}</text>
  <text x="${PAD + k * colW}" y="150" class="lbl">${l}</text>`).join("");

const max = Math.max(1, ...last30);
const gap = 8, bw = (W - PAD * 2 - gap * 29) / 30, base = 300, maxH = 96;
const bars = last30.map((c, k) => {
  const h = c ? Math.max(6, Math.round((Math.sqrt(c) / Math.sqrt(max)) * maxH)) : 3;
  const x = (PAD + k * (bw + gap)).toFixed(1);
  return `<rect x="${x}" y="${base - h}" width="${bw.toFixed(1)}" height="${h}" rx="3" fill="${c ? "url(#bar)" : "#262626"}"/>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <style>
    @font-face{font-family:G;font-weight:400;src:url(data:font/woff2;base64,${regular}) format("woff2")}
    @font-face{font-family:G;font-weight:500;src:url(data:font/woff2;base64,${medium}) format("woff2")}
    .num{font:500 56px G,sans-serif;letter-spacing:-2px;fill:url(#txt)}
    .lbl{font:400 17px G,sans-serif;fill:#ffffff;fill-opacity:.55}
    .cap{font:400 14px G,sans-serif;fill:#ffffff;fill-opacity:.4}
  </style>
  <clipPath id="r"><rect width="${W}" height="${H}" rx="16"/></clipPath>
  <radialGradient id="glow" cx="50%" cy="135%" r="75%" fx="50%" fy="135%" gradientTransform="translate(0.5 1.35) scale(0.8 1.6) translate(-0.5 -1.35)">
    <stop offset="0" stop-color="#002CE7" stop-opacity=".85"/><stop offset=".45" stop-color="#002CE7" stop-opacity=".3"/><stop offset="1" stop-color="#002CE7" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="txt" x1="0" y1="0" x2="0" y2="1"><stop offset=".31" stop-color="#FAFAFA"/><stop offset="1.27" stop-color="#C2D0FF"/></linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA8FF"/><stop offset="1" stop-color="#2A5BFF"/></linearGradient>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".08"/></pattern>
  <radialGradient id="fade" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
</defs>
<g clip-path="url(#r)">
  <rect width="${W}" height="${H}" fill="#0A0A0A"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#m)"/>
  ${statsSvg}
  <text x="${PAD}" y="${base - maxH - 22}" class="cap">Last 30 days</text>
  <text x="${W - PAD}" y="${base - maxH - 22}" class="cap" text-anchor="end">Today</text>
  ${bars}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="16" fill="none" stroke="#fff" stroke-opacity=".08"/>
</svg>
`;
writeFileSync(OUT, svg);
console.log(`total=${total} current=${current} longest=${longest} last30=${last30.join(",")}`);
