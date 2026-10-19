import { writeEarningsReport, reportInput } from "./src/lib/earningsReport.ts";
const H = { apikey: process.env.SUPABASE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_KEY}` };
const [row] = await (await fetch(`${process.env.SUPABASE_URL}/rest/v1/earnings_screen?id=eq.20261019800156&select=*`, { headers: H })).json();
const t0 = Date.now();
const r = await writeEarningsReport(reportInput({ kr: row }));
console.log(((Date.now() - t0) / 1000).toFixed(1) + "s", r.model, "\n", r.body.slice(0, 2500), "\n...\n", r.body.slice(-900));
