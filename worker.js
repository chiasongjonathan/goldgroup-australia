const DOMAIN_CONFIG = {
  "PG9 AUS": [
    "https://pg9aus.net",
    "https://pg9au.vip",
    "https://pg9aud.com",
    "https://pg9aus.co",
    "https://pg9aus.xyz"
  ],
  "H4WIN AUS": [
    "https://h4winaus.net",
    "https://h4winau.org",
    "https://h4winaus.co",
    "https://h4winau.net",
    "https://h4winaus.com"
  ],
  "RR4WIN AUS": [
    "https://rr4winaus.net",
    "https://rr4winau.com",
    "https://rr4win.com",
    "https://rr4winaus.co",
    "https://rr4winau.org"
  ],
  "BOOMERANG AUS": [
    "https://boomerangau.com",
    "https://boomerangaus.casino",
    "https://boomerangaudollar.com",
    "https://boomerangaus.co",
    "https://boomerangaus.xyz"
  ]
};

const KV_KEY = "domain-monitor-state";
const REQUEST_TIMEOUT_MS = 8000;
const FAIL_DISABLE_THRESHOLD = 5;
const MIN_NEXT_CHECK_MINUTES = 10;
const MAX_NEXT_CHECK_MINUTES = 30;
const CONCURRENCY = 4;

function now() {
  return Date.now();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nextCheckAt() {
  const mins = randInt(MIN_NEXT_CHECK_MINUTES, MAX_NEXT_CHECK_MINUTES);
  return now() + mins * 60 * 1000;
}

function formatSydneyTime(timestamp) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function buildInitialState() {
  const domains = {};

  for (const [company, urls] of Object.entries(DOMAIN_CONFIG)) {
    for (const url of urls) {
      domains[url] = {
        company,
        url,
        status: "checking",
        ms: null,
        consecutiveFailures: 0,
        lastCheckedAt: null,
        lastSuccessAt: null,
        nextCheckAt: 0
      };
    }
  }

  return {
    updatedAt: now(),
    updatedAtSydney: formatSydneyTime(now()),
    domains
  };
}

async function loadState(env) {
  const raw = await env.MONITOR_KV.get(KV_KEY, "json");
  if (!raw || !raw.domains) {
    const state = buildInitialState();
    await saveState(env, state);
    return state;
  }
  return raw;
}

async function saveState(env, state) {
  const ts = now();
  state.updatedAt = ts;
  state.updatedAtSydney = formatSydneyTime(ts);
  await env.MONITOR_KV.put(KV_KEY, JSON.stringify(state));
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "GGA-Monitor/1.0"
      }
    });

    clearTimeout(timer);

    const duration = Date.now() - start;
    const ok = response.status < 500;

    return {
      ok,
      ms: ok ? duration : null
    };
  } catch {
    clearTimeout(timer);
    return {
      ok: false,
      ms: null
    };
  }
}

async function runLimited(items, limit, handler) {
  const running = [];
  const results = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => handler(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => {
        const i = running.indexOf(e);
        if (i >= 0) running.splice(i, 1);
      });

      running.push(e);

      if (running.length >= limit) {
        await Promise.race(running);
      }
    }
  }

  return Promise.all(results);
}

function buildApiPayload(state) {
  const companies = {};

  for (const companyName of Object.keys(DOMAIN_CONFIG)) {
    const list = Object.values(state.domains).filter(item => item.company === companyName);

    const sorted = [...list].sort((a, b) => {
      const order = { active: 0, checking: 1, inactive: 2 };
      const sa = order[a.status] ?? 9;
      const sb = order[b.status] ?? 9;
      if (sa !== sb) return sa - sb;

      const msA = Number(a.ms ?? 999999);
      const msB = Number(b.ms ?? 999999);
      if (msA !== msB) return msA - msB;

      return a.url.localeCompare(b.url);
    });

    companies[companyName] = sorted.map(item => ({
      url: item.url,
      status: item.status,
      ms: item.ms
    }));
  }

  return {
    updatedAt: state.updatedAt,
    updatedAtSydney: state.updatedAtSydney,
    companies
  };
}

async function processChecks(env) {
  const state = await loadState(env);
  const currentTime = now();

  const due = Object.values(state.domains).filter(item => currentTime >= (item.nextCheckAt || 0));

  if (!due.length) {
    return state;
  }

  for (const item of due) {
    item.status = "checking";
    item.lastCheckedAt = currentTime;
  }

  await saveState(env, state);

  await runLimited(due, CONCURRENCY, async (item) => {
    const result = await checkUrl(item.url);

    if (result.ok) {
      item.status = "active";
      item.ms = result.ms;
      item.consecutiveFailures = 0;
      item.lastSuccessAt = now();
    } else {
      item.ms = null;
      item.consecutiveFailures += 1;

      if (item.consecutiveFailures >= FAIL_DISABLE_THRESHOLD) {
        item.status = "inactive";
      } else {
        item.status = "checking";
      }
    }

    item.lastCheckedAt = now();
    item.nextCheckAt = nextCheckAt();
  });

  await saveState(env, state);
  return state;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    if (url.pathname === "/api/status") {
      ctx.waitUntil(processChecks(env));

      const state = await loadState(env);
      const payload = buildApiPayload(state);

      return new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(processChecks(env));
  }
};