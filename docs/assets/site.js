(() => {
  "use strict";

  const config = window.WBTS_DOWNLOAD_CONFIG;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const latestApi = `https://api.github.com/repos/${config.repository}/releases/latest`;
  const releaseBase = `https://github.com/${config.repository}/releases/latest`;
  const downloadLabels = {
    "win-x64": "Windows x64 安装包",
    "win-ia32": "Windows x86 安装包",
    "win-arm64": "Windows ARM64 安装包",
  };
  let recommendedDownloadKey = "win-x64";

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function formatSize(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function findAsset(release, pattern) {
    return (release.assets || []).find((asset) => pattern.test(asset.name));
  }

  function setDownload(key, asset) {
    const card = document.querySelector(`[data-download="${key}"]`);
    if (!card) return;
    const link = $("a", card);
    const size = $("[data-size]", card);
    const version = $("[data-version]", card);
    if (!asset) {
      card.classList.add("is-unavailable");
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.textContent = "暂未发布";
      size.textContent = "当前版本暂无安装包";
      version.textContent = "—";
      return;
    }
    card.classList.remove("is-unavailable");
    link.href = asset.browser_download_url || asset.url;
    link.removeAttribute("aria-disabled");
    link.textContent = "下载 Windows 安装包";
    size.textContent = `${formatSize(asset.size)} · GitHub Releases`;
    version.textContent = asset.name;
  }

  function updatePrimaryDownload() {
    const primary = $("[data-primary-download]");
    const card = document.querySelector(`[data-download="${recommendedDownloadKey}"]`);
    const cardLink = card ? $("a", card) : null;
    if (!primary || !cardLink || !cardLink.href || card?.classList.contains("is-unavailable")) return;

    primary.href = cardLink.href;
    primary.setAttribute("aria-label", `下载 ${downloadLabels[recommendedDownloadKey]}`);
    primary.replaceChildren(`下载 ${downloadLabels[recommendedDownloadKey]} `);
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↓";
    primary.append(icon);
  }

  function applyRelease(release, { source }) {
    const version = release.tag_name || release.tagName || "v—";
    const published = release.published_at || release.publishedAt;
    const url = release.html_url || release.url || releaseBase;
    const normalized = {
      ...release,
      assets: (release.assets || []).map((asset) => ({
        ...asset,
        browser_download_url: asset.browser_download_url || asset.browserDownloadUrl || asset.url,
      })),
    };

    const releaseLink = $("#footerRelease");
    $("#releaseVersion").textContent = version;
    $("#releaseDate").textContent = `发布于 ${formatDate(published)}`;
    const heroVersion = $("#heroVersion");
    if (heroVersion) heroVersion.textContent = version;
    if (releaseLink) {
      releaseLink.href = url;
      releaseLink.textContent = `${version} 发布说明`;
    }
    $("#syncStatus").textContent = source === "live" ? "已同步 GitHub 最新免费公测版" : "当前使用已验证的发布信息";

    setDownload("win-x64", findAsset(normalized, /-win-x64\.exe$/i));
    setDownload("win-ia32", findAsset(normalized, /-win-ia32\.exe$/i));
    setDownload("win-arm64", findAsset(normalized, /-win-arm64\.exe$/i));
    updatePrimaryDownload();
  }

  async function detectPlatform() {
    const text = `${navigator.userAgent || ""} ${navigator.platform || ""}`.toLowerCase();
    const platform = text.includes("windows") ? "Windows" : "非 Windows 系统";
    let architecture = /arm|aarch64/.test(text) ? "ARM64" : "x64";
    try {
      if (navigator.userAgentData?.getHighEntropyValues) {
        const data = await navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "platform"]);
        if (data.platform) architecture = /arm/i.test(data.architecture) ? "ARM64" : (data.bitness === "32" ? "x86" : "x64");
      }
    } catch { /* 浏览器拒绝 User-Agent Client Hints 时使用基础识别。 */ }
    $("#detectedPlatform").textContent = `${platform} · ${architecture}`;
    recommendedDownloadKey = platform === "Windows" && architecture === "ARM64" ? "win-arm64"
      : platform === "Windows" && architecture === "x86" ? "win-ia32"
        : "win-x64";
    const card = document.querySelector(`[data-download="${recommendedDownloadKey}"]`);
    if (card && !card.classList.contains("is-unavailable")) card.classList.add("is-recommended");
    updatePrimaryDownload();
  }

  async function loadRelease() {
    try {
      const response = await fetch(latestApi, { headers: { accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      applyRelease(await response.json(), { source: "live" });
    } catch (error) {
      applyRelease(config.fallbackRelease, { source: "fallback" });
      $("#syncStatus").textContent = "暂时无法同步，已展示可验证的当前下载信息";
      console.warn("Unable to load latest release", error);
    }
  }

  function initializeInteractions() {
    $$("[data-copy-release]").forEach((button) => {
      button.addEventListener("click", async () => {
        const text = $("#footerRelease").href;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "已复制发布页链接";
        } catch {
          button.textContent = "请复制浏览器地址";
        }
        window.setTimeout(() => { button.textContent = "复制发布页链接"; }, 1800);
      });
    });
    $$("[data-copy-qq-group]").forEach((button) => {
      button.addEventListener("click", async () => {
        const group = String(button.dataset.qqGroup || "").trim();
        if (!/^\d{5,15}$/.test(group)) return;
        try {
          await navigator.clipboard.writeText(group);
          button.textContent = `群号 ${group} 已复制`;
        } catch {
          button.textContent = `请复制群号 ${group}`;
        }
        window.setTimeout(() => { button.textContent = `复制 QQ 群号 ${group}`; }, 2200);
      });
    });
  }

  function initializeScrollNavigation() {
    const links = $$('[data-scroll-link]');
    const targets = links
      .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
      .filter(({ target }) => target);
    if (!targets.length) return;

    const setActive = (id) => {
      targets.forEach(({ link, target }) => link.classList.toggle("active", target.id === id));
    };
    targets.forEach(({ link, target }) => {
      link.addEventListener("click", () => setActive(target.id));
    });
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-28% 0px -61% 0px", threshold: [0.05, 0.2, 0.5] });
    targets.forEach(({ target }) => observer.observe(target));
  }

  initializeInteractions();
  initializeScrollNavigation();
  // GitHub API 可以限流或被网络拦截。先用页面内的已验证版本填充链接，
  // 确保脚本刚运行时以及 API 不可用时，用户都能直接开始下载。
  applyRelease(config.fallbackRelease, { source: "fallback" });
  Promise.all([loadRelease(), detectPlatform()]);
})();
