const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

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

const API_URL = "https://your-api.com/domain-status";
const REFRESH_INTERVAL = 30 * 60 * 1000;

function sortDomains(domains) {
  return [...domains].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }

    const stableA = Number(a.stable ?? 0);
    const stableB = Number(b.stable ?? 0);
    if (stableA !== stableB) {
      return stableB - stableA;
    }

    const msA = Number(a.ms ?? 999999);
    const msB = Number(b.ms ?? 999999);
    return msA - msB;
  });
}

function createDomainCard(domain) {
  const isActive = domain.status === "active";
  const el = document.createElement(isActive ? "a" : "div");

  el.className = `domain-card ${isActive ? "" : "disabled"}`.trim();

  if (isActive) {
    el.href = domain.url.startsWith("http") ? domain.url : `https://${domain.url}`;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  }

  el.innerHTML = `
    <div class="domain-main">
      <span class="domain-name">${domain.url}</span>
      <span class="status ${domain.status}">${domain.status}</span>
    </div>
    <div class="domain-meta">
      <span class="domain-ms">${isActive ? `${domain.ms} ms` : "--"}</span>
      <span class="domain-stable">${isActive ? `Stable ${domain.stable}%` : "Unavailable"}</span>
    </div>
  `;

  return el;
}

function renderCompanyDomains(container, domains) {
  container.innerHTML = "";

  const sorted = sortDomains(domains);

  const topDomains = sorted.filter(d => d.status === "active").slice(0, 3);
  const remainingDomains = sorted.filter(d => !topDomains.includes(d));

  const topWrap = document.createElement("div");
  topWrap.className = "top-domains";

  if (topDomains.length === 0) {
    const empty = document.createElement("div");
    empty.className = "domain-card disabled";
    empty.innerHTML = `
      <div class="domain-main">
        <span class="domain-name">No active website available</span>
        <span class="status inactive">inactive</span>
      </div>
      <div class="domain-meta">
        <span class="domain-ms">--</span>
        <span class="domain-stable">Please try again later</span>
      </div>
    `;
    topWrap.appendChild(empty);
  } else {
    topDomains.forEach(domain => {
      topWrap.appendChild(createDomainCard(domain));
    });
  }

  container.appendChild(topWrap);

  if (remainingDomains.length > 0) {
    const extraWrap = document.createElement("div");
    extraWrap.className = "extra-domains";

    remainingDomains.forEach(domain => {
      extraWrap.appendChild(createDomainCard(domain));
    });

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

    container.appendChild(extraWrap);
    container.appendChild(toggleBtn);
  }
}

function showLoading() {
  document.querySelectorAll(".domain-list").forEach(container => {
    container.innerHTML = `
      <div class="domain-card loading">
        <div class="domain-main">
          <span class="domain-name">Checking websites...</span>
          <span class="status checking">checking</span>
        </div>
      </div>
    `;
  });
}

function showError() {
  document.querySelectorAll(".domain-list").forEach(container => {
    container.innerHTML = `
      <div class="domain-card disabled">
        <div class="domain-main">
          <span class="domain-name">Unable to load website status</span>
          <span class="status inactive">error</span>
        </div>
      </div>
    `;
  });
}

function updateLastUpdateTime() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;

  const now = new Date();
  el.textContent = `Last updated: ${now.toLocaleString()}`;
}

async function fetchDomainStatus() {
  try {
    showLoading();

    const res = await fetch(API_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    Object.keys(data).forEach(company => {
      const container = document.querySelector(`[data-company="${company}"]`);
      if (!container) return;
      renderCompanyDomains(container, data[company]);
    });

    updateLastUpdateTime();
  } catch (error) {
    console.error("Domain status API error:", error);
    showError();
  }
}

fetchDomainStatus();
setInterval(fetchDomainStatus, REFRESH_INTERVAL);