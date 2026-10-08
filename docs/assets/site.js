(() => {
  "use strict";

  const config = window.WBTS_DOWNLOAD_CONFIG;
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const latestApi = `https://api.github.com/repos/${config.repository}/releases/latest`;
  const releaseBase = `https://github.com/${config.repository}/releases/latest`;

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
    link.textContent = key.startsWith("linux") ? "选择此版本" : "下载 Windows 安装包";
    size.textContent = `${formatSize(asset.size)} · GitHub Releases`;
    version.textContent = asset.name;
  }

  function setStoreLinks() {
    const purchaseUrl = String(config.productUrl || config.storeUrl || "").trim();
    const ready = Boolean(config.productUrl);
    $$('[data-store-link]').forEach((link) => {
      link.href = purchaseUrl;
      link.textContent = ready ? "购买激活码" : "进入店铺";
    });

    const activation = $("#activationNotice");
    const plan = config.plan || {};
    const deviceText = Number.isInteger(Number(plan.maxDevices)) && Number(plan.maxDevices) > 0
      ? `每个激活码可绑定 ${Number(plan.maxDevices)} 台设备。`
      : "可绑定设备数以商品页为准。";
    if (ready && plan.delivery === "auto") {
      activation.textContent = `支付成功后自动获得激活码；${deviceText} 换机前请在旧设备点击“解绑本机”，再在新设备激活。`;
      return;
    }
    activation.textContent = `店铺商品正在配置中。${deviceText} 商品上线后会在店铺页说明发码与换机规则。`;
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

    $("#releaseVersion").textContent = version;
    $("#releaseDate").textContent = `发布于 ${formatDate(published)}`;
    $("#releaseLink").href = url;
    $("#releaseLink").textContent = `${version} 发布说明`;
    $("#syncStatus").textContent = source === "live" ? "已同步 GitHub 最新正式版" : "当前使用已验证的发布信息";

    setDownload("win-x64", findAsset(normalized, /-win-x64\.exe$/i));
    setDownload("win-arm64", findAsset(normalized, /-win-arm64\.exe$/i));
    setDownload("linux-x64-appimage", findAsset(normalized, /-linux-(?:x86_64|amd64)\.AppImage$/i));
    setDownload("linux-x64-deb", findAsset(normalized, /-linux-amd64\.deb$/i));
    setDownload("linux-arm64-appimage", findAsset(normalized, /-linux-arm64\.AppImage$/i));
    setDownload("linux-arm64-deb", findAsset(normalized, /-linux-arm64\.deb$/i));
  }

  async function detectPlatform() {
    const text = `${navigator.userAgent || ""} ${navigator.platform || ""}`.toLowerCase();
    const platform = text.includes("windows") ? "Windows" : text.includes("linux") ? "Linux" : text.includes("mac") ? "macOS" : "你的系统";
    let architecture = /arm|aarch64/.test(text) ? "ARM64" : "x64";
    try {
      if (navigator.userAgentData?.getHighEntropyValues) {
        const data = await navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "platform"]);
        if (data.platform) architecture = /arm/i.test(data.architecture) ? "ARM64" : (data.bitness === "64" ? "x64" : architecture);
      }
    } catch { /* 浏览器拒绝 User-Agent Client Hints 时使用基础识别。 */ }
    $("#detectedPlatform").textContent = `${platform} · ${architecture}`;
    const recommended = platform === "Windows" && architecture === "ARM64" ? "win-arm64"
      : platform === "Linux" && architecture === "ARM64" ? "linux-arm64-appimage"
        : platform === "Linux" ? "linux-x64-appimage" : "win-x64";
    const card = document.querySelector(`[data-download="${recommended}"]`);
    if (card && !card.classList.contains("is-unavailable")) card.classList.add("is-recommended");
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
        const text = $("#releaseLink").href;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "已复制发布页链接";
        } catch {
          button.textContent = "请复制浏览器地址";
        }
        window.setTimeout(() => { button.textContent = "复制发布页链接"; }, 1800);
      });
    });
  }

  setStoreLinks();
  initializeInteractions();
  Promise.all([loadRelease(), detectPlatform()]);
})();
