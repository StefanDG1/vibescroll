export const defaults = Object.freeze({
  currency: "EUR",
  monthlyPrice: 35,
  annualPrice: 350,
  users: 100,
  allowance: 300,
  multipliers: true,
  utilization: 100,
  seconds: 60,
  model: "muse",
  weeklyPrice: 8,
  weeklyCredits: 50,
  costMode: "observed_muse",
  inputCap: 50000,
  outputCap: 12000,
  targetMargin: 80,
  captions: 0,
  sandboxSeconds: 60,
  cpuSeconds: 10,
  actionSeconds: 90,
  historyMonths: 12,
  copies: 2,
  vat: 21,
  refund: 2,
  retry: 15,
  gatewayFunding: 3,
  usdPerEur: 1.1133,
  ronPerEur: 5.3508,
  supplierTax: 0,
  chatgpt: 103,
  accounting: 50,
  domainAnnual: 20,
  otherFixed: 3,
  founderPay: 0,
  marketingFixed: 0,
  cac: 0,
  churn: 5,
  support: 0.5,
  convexPro: false,
  flatCdn: false,
});

export function credits(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error("Invalid duration");
  return Math.max(1, Math.ceil(seconds / 60));
}
const ceilPositive = (n) => Math.max(0, Math.ceil(n));

export function quantities(a) {
  const used = (a.allowance * a.utilization) / 100;
  const scale = Math.max(1, a.seconds / 104.176);
  // Budget the highest reasoning inside a finite total billed-output cap.
  // OpenAI uses EU rates + the higher first-write input rate; no warm cache assumed.
  const high = {
    muse: a.inputCap * 0.0000001 + a.outputCap * 0.0000002,
    terra: a.inputCap * 0.000001375 + a.outputCap * 0.0000055,
    sol: a.inputCap * 0.00000275 + a.outputCap * 0.000011,
    subscription: 0,
  };
  const analysis =
    a.costMode === "high_budget" || ["terra", "sol"].includes(a.model)
      ? high[a.model]
      : { muse: 0.0034287, subscription: 0 }[a.model] * scale;
  const asr = a.seconds * 0.00002778 * (1 - a.captions / 100);
  const sandbox =
    (a.cpuSeconds * 0.184) / 3600 +
    (4 * Math.max(60, a.sandboxSeconds) * 0.0304) / 3600 +
    0.0000006;
  const baseAI = a.costMode === "high_budget" ? high.muse : 0.0034287 * scale;
  const common =
    asr +
    sandbox +
    ((0.5 * a.actionSeconds) / 3600) * (a.convexPro ? 0.39 : 0.429) +
    (40 * (a.convexPro ? 2.6 : 2.86)) / 1e6 +
    0.001 * (a.convexPro ? 0.26 : 0.286) +
    0.004 * (a.convexPro ? 0.156 : 0.1716) +
    0.001;
  const ratio = (analysis + common) / (baseAI + common);
  const multiplier =
    a.multipliers && a.model !== "subscription"
      ? ([1, 2, 5, 10, 20, 50, 100].find((band) => band + 1e-9 >= ratio) ?? 100)
      : 1;
  // Uniform-duration scenario. Round each real source separately in production.
  const jobs = used / (credits(a.seconds) * multiplier);
  const q = {
    used,
    jobs,
    multiplier,
    minutes: (jobs * a.seconds) / 60,
    analysis,
    asr,
    sandbox,
    actionGBh: (0.5 * a.actionSeconds) / 3600,
    calls: 40,
    dbIO: 0.001,
    dbEgress: 0.004,
    dbStorage: 0.0001 * a.copies * a.historyMonths,
    searchStorage: 0.00002 * a.historyMonths,
    r2Storage: 0.0008 * a.copies * a.historyMonths,
    put: 10 * a.copies,
    get: 24,
    // Web/controller + three evidence views; no full video hosted for playback.
    webCPU: 1 / 3600,
    webMemory: (2 * 10) / 3600,
    webInvocations: 30,
    originGB: 0.004,
    deliveryGB: 0.003,
    cdnRequests: 30,
  };
  return q;
}

export function providerCosts(a, n, included) {
  const q = quantities(a),
    jobs = n * q.jobs,
    r = 1 + a.retry / 100;
  const cv = a.convexPro
    ? {
        calls: 2.6,
        callFree: 25e6,
        action: 0.39,
        actionFree: 250,
        db: 0.26,
        dbFree: 50,
        ioFree: 50,
        egress: 0.156,
        egressFree: 50,
        search: 0.65,
        searchFree: 1,
      }
    : {
        calls: 2.86,
        callFree: 1e6,
        action: 0.429,
        actionFree: 20,
        db: 0.286,
        dbFree: 0.5,
        ioFree: 1,
        egress: 0.1716,
        egressFree: 1,
        search: 0.715,
        searchFree: 0.5,
      };
  const over = (v, free) => Math.max(0, v - (included ? free : 0));
  const rows = [
    [
      "AI analysis",
      jobs * q.analysis * r * (1 + a.gatewayFunding / 100),
      a.costMode === "high_budget" || ["terra", "sol"].includes(a.model)
        ? "50k input / 12k billed output at defaults; a cost ceiling, not observed usage"
        : "Measured Muse high-reasoning cost, or zero API reasoning for own subscription; 15% contingency at defaults",
    ],
    [
      "Transcription",
      jobs * q.asr * r * (1 + a.gatewayFunding / 100),
      "MAI 2; captions avoid ASR; same funding reserve",
    ],
    [
      "Convex action compute",
      over(jobs * q.actionGBh * r, cv.actionFree) * cv.action,
      "512 MiB Node action; EU rate; elapsed time assumed",
    ],
    [
      "Convex function calls",
      (over(jobs * q.calls * r, cv.callFree) / 1e6) * cv.calls,
      "40 calls per fresh job assumed",
    ],
    [
      "Convex database I/O",
      over(jobs * q.dbIO * r, cv.ioFree) * cv.db,
      "1 MB per job assumed",
    ],
    [
      "Convex egress",
      over(jobs * q.dbEgress * r, cv.egressFree) * cv.egress,
      "4 MB per job assumed; includes evidence transport",
    ],
    [
      "Convex database retention",
      over(jobs * q.dbStorage, cv.dbFree) * cv.db,
      "100 KB × copy count × retained months; indexes included in assumption",
    ],
    [
      "Convex search index",
      over(jobs * q.searchStorage, cv.searchFree) * cv.search,
      "20 KB per source per month of retained history assumed",
    ],
    [
      "R2 retained screenshots",
      (included
        ? ceilPositive(over(jobs * q.r2Storage, 10))
        : jobs * q.r2Storage) * 0.015,
      "800 KB per bundle × copy count × retained months; account GB rounded up",
    ],
    [
      "R2 writes",
      (included
        ? ceilPositive(over(jobs * q.put, 1e6) / 1e6)
        : (jobs * q.put) / 1e6) * 4.5,
      "20 writes per source at two copies; account million-request billing buckets",
    ],
    [
      "R2 reads",
      (included
        ? ceilPositive(over(jobs * q.get, 10e6) / 1e6)
        : (jobs * q.get) / 1e6) * 0.36,
      "24 reads per source; R2 internet egress $0",
    ],
  ];
  const sandbox = jobs * q.sandbox * r;
  const web =
    jobs *
    (q.webCPU * 0.184 +
      q.webMemory * 0.0152 +
      (q.webInvocations / 1e6) * 0.6 +
      q.originGB * 0.06) *
    r;
  const delivery = a.flatCdn
    ? 0
    : jobs * (q.deliveryGB * 0.15 + (q.cdnRequests / 1e6) * 2.0) * r;
  // $2 engineering/broker/build/snapshot reserve shares, rather than duplicates,
  // Vercel's $20 usage credit. CDN flat tier is an explicit scenario, not enabled here.
  const vercelUsage = sandbox + web + delivery + (included ? 2 : 0);
  const vercelBase = included ? 20 : 0;
  const vercelOverage = over(vercelUsage, 20);
  const flatGB = jobs * q.deliveryGB * r;
  const flatReq = jobs * q.cdnRequests * r;
  const flatTier =
    !a.flatCdn || !included
      ? 0
      : flatReq <= 1e6 && flatGB <= 1000
        ? 0
        : flatReq <= 10e6 && flatGB <= 50000
          ? 20
          : flatReq <= 50e6 && flatGB <= 50000
            ? 100
            : flatReq <= 150e6 && flatGB <= 50000
              ? 300
              : null;
  const vercelCharge = included
    ? vercelBase + vercelOverage + (flatTier ?? 0)
    : vercelUsage;
  rows.push([
    "Vercel hosting + Sandbox",
    vercelCharge,
    included
      ? `$20 base includes $20 usage; raw modeled usage $${vercelUsage.toFixed(2)}; $2 shared operations reserve`
      : "Fully metered Sandbox, controller, delivery and origin transfer; no credit deduction",
  ]);
  if (a.convexPro && included)
    rows.push([
      "Convex Professional seat",
      25,
      "Optional scenario; not an account upgrade",
    ]);
  const emails = n * 10;
  rows.push([
    "Resend email",
    included
      ? emails <= 3000
        ? 0
        : 20 + ceilPositive((emails - 50000) / 1000) * 0.9
      : n * 10 * 0.0009,
    "10 emails per subscriber/month; Free requires ≤100/day; Pro after 3,000/month",
  ]);
  const analyticsEvents = n * 5000;
  rows.push([
    "PostHog analytics",
    over(analyticsEvents, 1e6) * 0.000198,
    "5,000 identified events per subscriber; first paid-band rate, conservative at scale",
  ]);
  rows.push([
    "AuthKit",
    n > 1e6 ? Math.ceil((n - 1e6) / 1e6) * 2500 : 0,
    "Free to 1M MAU; no paid SSO/custom domain/Radar assumed",
  ]);
  const usdEuro = (1 + a.supplierTax / 100) / a.usdPerEur;
  return {
    rows: rows.map(([name, usd, note]) => ({
      name,
      usd,
      eur: usd * usdEuro,
      note,
    })),
    q,
    vercel: { sandbox, web, delivery, vercelUsage, vercelOverage, flatTier },
    outsideCdnRange: flatTier === null,
  };
}

export function revenue(a, annual) {
  const price =
    annual === "weekly"
      ? a.weeklyPrice
      : annual
        ? a.annualPrice
        : a.monthlyPrice;
  const months = annual === "weekly" ? (7 * 12) / 365.25 : annual ? 12 : 1;
  const gross = price / months / (a.currency === "USD" ? a.usdPerEur : 1);
  const refund = (gross * a.refund) / 100;
  const vat = gross - refund - (gross - refund) / (1 + a.vat / 100);
  const net = gross - refund - vat;
  const fixedTxn = (1 + 0.31 * 1.1 + 100 * 0.001) / a.ronPerEur / months;
  const fees = gross * (0.018 + 0.035 + 0.007 + 0.005) + fixedTxn;
  const paymentRows = [
    [
      "Card processing (1.8% blended)",
      gross * 0.018 + 1 / a.ronPerEur / months,
    ],
    ["Managed Payments (3.5%)", gross * 0.035],
    ["Stripe Billing (0.7%)", gross * 0.007],
    ["Advanced Radar reserve", (0.31 * 1.1) / a.ronPerEur / months],
    [
      "FX + dispute reserve",
      gross * 0.005 + (100 * 0.001) / a.ronPerEur / months,
    ],
  ];
  return { gross, refund, vat, net, fees, paymentRows };
}

export function economics(a, n, annual = false) {
  const effective =
    annual === "weekly"
      ? { ...a, allowance: (a.weeklyCredits * 365.25) / 7 / 12 }
      : a;
  const rev = revenue(a, annual),
    providers = providerCosts(effective, n, true);
  const cashFixed =
    a.chatgpt +
    a.accounting +
    a.domainAnnual / 12 +
    a.otherFixed +
    a.founderPay +
    a.marketingFixed;
  const customerCost = a.support + (a.cac * a.churn) / 100;
  const providerEur = providers.rows.reduce((s, r) => s + r.eur, 0);
  const netRevenue = n * rev.net;
  const cost = providerEur + cashFixed + n * (rev.fees + customerCost);
  const profit = netRevenue - cost;
  const fullProvider = providerCosts(effective, 1, false).rows.reduce(
    (s, r) => s + r.eur,
    0,
  );
  const contribution = rev.net - rev.fees - customerCost - fullProvider;
  return {
    n,
    rev,
    providers,
    cashFixed,
    customerCost,
    providerEur,
    netRevenue,
    cost,
    profit,
    margin: n ? profit / netRevenue : null,
    fullProvider,
    contribution,
    contributionMargin: contribution / rev.net,
  };
}
export function breakEven(a, annual = false, target = 0) {
  for (let n = 1; n <= 20000; n++) {
    const e = economics(a, n, annual);
    if (e.profit >= 0 && (target === 0 || e.margin >= target)) return n;
  }
  return null;
}

export function requiredPrices(a, margin = a.targetMargin / 100) {
  // Sustainable unit contribution: full rates, no fixed-overhead or ad allocation.
  const provider = providerCosts(a, 1, false).rows.reduce(
    (s, r) => s + r.eur,
    0,
  );
  const revenuePerGross = (1 - a.refund / 100) / (1 + a.vat / 100);
  const denominator = revenuePerGross * (1 - margin) - 0.065;
  if (denominator <= 0) return null;
  const fixedTxn = (1 + 0.31 * 1.1 + 0.1) / a.ronPerEur;
  const service = provider + a.support;
  const monthlyEUR = (service + fixedTxn) / denominator;
  const annualEUR = (12 * (service + fixedTxn / 12)) / denominator;
  // Same ten-month annual discount as 350/35; round to useful five-unit prices.
  const factor = a.currency === "USD" ? a.usdPerEur : 1;
  const pairedMonthly = digitalRoot8Ceiling(
    Math.max(monthlyEUR, annualEUR / 10) * factor,
  );
  const weeklyCredits = a.allowance === 500 ? 125 : 75;
  const weeksPerMonth = 365.25 / 7 / 12;
  const weeklyProvider = providerCosts(
    { ...a, allowance: weeklyCredits * weeksPerMonth },
    1,
    false,
  ).rows.reduce((s, r) => s + r.eur, 0);
  const weeklyMargin = Math.min(0.9, margin + 0.03);
  const weeklyDenominator = revenuePerGross * (1 - weeklyMargin) - 0.065;
  const weeklyEUR =
    weeklyDenominator > 0
      ? ((weeklyProvider + a.support) / weeksPerMonth + fixedTxn) /
        weeklyDenominator
      : null;
  return {
    margin,
    monthlyEUR,
    annualEUR,
    pairedMonthly,
    pairedAnnual: pairedMonthly * 10,
    weeklyCredits,
    weeklyMargin,
    weeklyEUR,
    roundedWeekly:
      weeklyEUR === null ? null : digitalRoot8Ceiling(weeklyEUR * factor),
  };
}

export function digitalRoot8Ceiling(value) {
  const integer = Math.ceil(value - 1e-10);
  return integer + ((8 - (integer % 9) + 9) % 9);
}

export function topups(a) {
  const unit =
    providerCosts({ ...a, utilization: 100 }, 1, false)
      .rows.filter(
        (r) =>
          !["Resend email", "PostHog analytics", "AuthKit"].includes(r.name),
      )
      .reduce((s, r) => s + r.eur, 0) / a.allowance;
  return [
    [10, 200],
    [25, 550],
  ].map(([price, credits]) => {
    const gross = price / (a.currency === "USD" ? a.usdPerEur : 1),
      net = (gross * (1 - a.refund / 100)) / (1 + a.vat / 100);
    // One-off Checkout: no Billing fee. Retain same card/MoR/risk assumptions.
    const fee =
      gross * (0.018 + 0.035 + 0.005) + (1 + 0.31 * 1.1 + 0.1) / a.ronPerEur;
    const cost = credits * unit,
      contribution = net - fee - cost;
    return {
      price,
      credits,
      net,
      fee,
      cost,
      contribution,
      margin: contribution / net,
    };
  });
}
