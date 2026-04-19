console.log("SCRIPT LOADED");

const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");
const lastUpdateEl = document.getElementById("lastUpdate");

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    mainNav.classList.toggle("show");
  });
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener("click", function (e) {
    const targetId = this.getAttribute("href");
    if (targetId.length > 1) {
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
        if (mainNav) {
          mainNav.classList.remove("show");
        }
      }
    }
  });
});

const API_URL =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "https://goldgroupaustralia.com/api/status"
    : "/api/status";

const FRONTEND_REFRESH_MS = 30 * 1000;

function formatSydneyTime(timestamp) {
  try {
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
  } catch (err) {
    return new Date(timestamp).toLocaleString();
  }
}

function updateLastUpdate(updatedAt, updatedAtSydney) {
  if (!lastUpdateEl) return;

  if (updatedAtSydney) {
    lastUpdateEl.textContent = `Last updated (Sydney): ${updatedAtSydney}`;
    return;
  }

  if (updatedAt) {
    lastUpdateEl.textContent = `Last updated (Sydney): ${formatSydneyTime(updatedAt)}`;
    return;
  }

  lastUpdateEl.textContent = "Last updated: --";
}

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "active";
  if (s === "checking") return "checking";
  return "inactive";
}

function getStatusLabel(status) {
  const s = normalizeStatus(status);
  if (s === "active") return "Active";
  if (s === "checking") return "Checking";
  return "Disabled";
}

function cleanUrl(url) {
  return String(url || "").replace(/^https?:\/\//, "");
}

function sortDomains(domains) {
  return [...domains].sort((a, b) => {
    const order = { active: 0, checking: 1, inactive: 2 };

    const sa = order[normalizeStatus(a.status)] ?? 9;
    const sb = order[normalizeStatus(b.status)] ?? 9;
    if (sa !== sb) return sa - sb;

    const msA = Number(a.ms ?? 999999);
    const msB = Number(b.ms ?? 999999);
    if (msA !== msB) return msA - msB;

    return cleanUrl(a.url).localeCompare(cleanUrl(b.url));
  });
}

function createDomainCard(domain) {
  const status = normalizeStatus(domain.status);
  const isActive = status === "active";
  const tag = getStatusLabel(status);

  const wrapper = document.createElement(isActive ? "a" : "div");
  wrapper.className = `domain-card ${isActive ? "" : "disabled"}`.trim();

  if (isActive) {
    wrapper.href = domain.url;
    wrapper.target = "_blank";
    wrapper.rel = "noopener noreferrer";
  }

  const metaMs =
    status === "active" && domain.ms != null
      ? `${domain.ms} ms`
      : status === "checking"
      ? "Rechecking"
      : "Unavailable";

  const metaStable =
    status === "active"
      ? "Stable access"
      : status === "checking"
      ? "Pending update"
      : "Hidden access";

  wrapper.innerHTML = `
    <div class="domain-main">
      <span class="domain-name">${cleanUrl(domain.url)}</span>
      <span class="status ${status}">${tag}</span>
    </div>
    <div class="domain-meta">
      <span>${metaMs}</span>
      <span>${metaStable}</span>
    </div>
  `;

  return wrapper;
}

function createEmptyCard() {
  const empty = document.createElement("div");
  empty.className = "domain-card disabled";
  empty.innerHTML = `
    <div class="domain-main">
      <span class="domain-name">No active website available</span>
      <span class="status inactive">Disabled</span>
    </div>
    <div class="domain-meta">
      <span>--</span>
      <span>Please try again later</span>
    </div>
  `;
  return empty;
}

function renderCompanyDomains(companyBlock, domains) {
  const section = companyBlock.querySelector(".domain-section");
  if (!section) return;

  section.innerHTML = "";

  const sorted = sortDomains(domains);
  const topDomains = sorted.filter(d => normalizeStatus(d.status) === "active").slice(0, 3);
  const extraDomains = sorted.filter(d => !topDomains.includes(d));

  const topWrap = document.createElement("div");
  topWrap.className = "domain-list top-domains";

  if (!topDomains.length) {
    topWrap.appendChild(createEmptyCard());
  } else {
    topDomains.forEach(domain => topWrap.appendChild(createDomainCard(domain)));
  }

  section.appendChild(topWrap);

  if (extraDomains.length > 0) {
    const extraWrap = document.createElement("div");
    extraWrap.className = "extra-domains";

    const extraList = document.createElement("div");
    extraList.className = "domain-list";

    extraDomains.forEach(domain => {
      extraList.appendChild(createDomainCard(domain));
    });

    extraWrap.appendChild(extraList);
    section.appendChild(extraWrap);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.type = "button";
    toggleBtn.textContent = "Show More";

    toggleBtn.addEventListener("click", () => {
      extraWrap.classList.toggle("show");
      toggleBtn.textContent = extraWrap.classList.contains("show")
        ? "Show Less"
        : "Show More";
    });

    section.appendChild(toggleBtn);
  }
}

function updateInstallButtons(companyMap) {
  document.querySelectorAll(".company-block").forEach(block => {
    const companyName = block.querySelector("h3")?.textContent?.trim();
    const installBtn = block.querySelector(".install-btn");
    if (!companyName || !installBtn) return;

    const domains = companyMap[companyName] || [];
    const activeDomains = sortDomains(domains).filter(d => normalizeStatus(d.status) === "active");

    if (activeDomains.length) {
      installBtn.href = activeDomains[0].url;
      installBtn.target = "_blank";
      installBtn.rel = "noopener noreferrer";
      installBtn.style.pointerEvents = "auto";
      installBtn.style.opacity = "1";
    } else {
      installBtn.href = "#";
      installBtn.removeAttribute("target");
      installBtn.removeAttribute("rel");
      installBtn.style.pointerEvents = "none";
      installBtn.style.opacity = "0.55";
    }
  });
}

function renderPayload(payload) {
  const companyMap = payload.companies || {};

  updateLastUpdate(payload.updatedAt, payload.updatedAtSydney);

  document.querySelectorAll(".company-block").forEach(block => {
    const companyName = block.querySelector("h3")?.textContent?.trim();
    if (!companyName) return;

    const domains = companyMap[companyName] || [];
    renderCompanyDomains(block, domains);
  });

  updateInstallButtons(companyMap);
}

function renderError() {
  document.querySelectorAll(".company-block").forEach(block => {
    const section = block.querySelector(".domain-section");
    if (!section) return;

    section.innerHTML = `
      <div class="domain-list">
        <div class="domain-card disabled">
          <div class="domain-main">
            <span class="domain-name">Unable to load website status</span>
            <span class="status inactive">Error</span>
          </div>
          <div class="domain-meta">
            <span>--</span>
            <span>Please try again later</span>
          </div>
        </div>
      </div>
    `;
  });

  updateLastUpdate(null, null);
}

async function fetchDomainStatus() {
  try {
    const res = await fetch(API_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    console.log("API payload:", payload);
    renderPayload(payload);
  } catch (error) {
    console.error("Domain status API error:", error);
    renderError();
  }
}

fetchDomainStatus();
setInterval(fetchDomainStatus, FRONTEND_REFRESH_MS);