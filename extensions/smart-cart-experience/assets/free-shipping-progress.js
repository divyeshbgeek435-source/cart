(function () {
  var script = document.currentScript;
  if (!script) return;

  var thresholdValue = Number(script.dataset.threshold || 0);
  var thresholdCents = Math.max(0, Math.round(thresholdValue * 100));
  var shippingChargeValue = Number(script.dataset.shippingCharge || 0);
  var shippingChargeCents = Math.max(0, Math.round(shippingChargeValue * 100));
  var titleText = script.dataset.title || "Free shipping progress";
  var progressText = script.dataset.progressText || "Spend [remaining_amount] more for free shipping.";
  var reachedText = script.dataset.reachedText || "You have free shipping!";
  var chargedText = script.dataset.chargedText || "Shipping charge [shipping_amount] applied";
  var sequentialMode = String(script.dataset.sequentialMode || "").toLowerCase() === "true";
  var unlockAttributeKey =
    (script.dataset.unlockAttributeKey || "sce_sequential_unlock").trim() || "sce_sequential_unlock";
  var sequentialTitle = script.dataset.sequentialTitle || titleText;
  var tier1Label = script.dataset.tier1Label || "Discount";
  var tier2Label = script.dataset.tier2Label || "Free shipping";
  var unlockTier1Text = script.dataset.unlockTier1Text || "Unlock Tier 1";
  var unlockTier2Text = script.dataset.unlockTier2Text || "Unlock free shipping";
  var tier1DoneText = script.dataset.tier1DoneText || "Tier 1 unlocked";
  var tier2DoneText = script.dataset.tier2DoneText || "Tier 2 unlocked";
  var tier1TagText = script.dataset.tier1TagText || "10% OFF";
  var tier2TagText = script.dataset.tier2TagText || "Free shipping";
  var lockedText = script.dataset.lockedText || "Locked";
  var appliedText = script.dataset.appliedText || "Applied";
  var sequentialHintZero =
    script.dataset.sequentialHintZero || "Progress: 0% — unlock Tier 1 to start.";
  var sequentialHintMid =
    script.dataset.sequentialHintMid || "Progress: 50% — unlock Tier 2 for free shipping.";
  var sequentialMsg0 =
    script.dataset.sequentialMsg0 ||
    "Unlock Tier 1 to apply your cart discount. Then unlock Tier 2 for free shipping.";
  var sequentialMsg1 =
    script.dataset.sequentialMsg1 ||
    "Apply discount to unlock free shipping";
  var sequentialMsg2 =
    script.dataset.sequentialMsg2 ||
    "Free shipping unlocked";
  var tiers = parseTiers(script.dataset.tiers, shippingChargeCents);
  var cartNameText = script.dataset.cartName || "";
  var defaultNameTargets = [
    ".drawer__header",
    ".drawer__inner",
    ".drawer",
    ".cart-drawer__content",
    ".cart-drawer",
    "cart-drawer",
    "#CartDrawer",
    ".ajaxcart",
    "form[action='/cart']",
    ".cart__blocks"
  ];
  var parsedNameTargets = (script.dataset.nameTargets || "").split(",").map(function (s) {
    return s.trim();
  }).filter(Boolean);
  var nameTargetSelectors = parsedNameTargets.length ? parsedNameTargets : defaultNameTargets;
  var selectorTargets = (script.dataset.targets || "").split(",").map(function (s) {
    return s.trim();
  }).filter(Boolean);
  var defaultWidgetTargets = [
    ".drawer__inner",
    ".cart-drawer__content",
    "cart-drawer",
    "[id*='CartDrawer']",
    "form[action='/cart']",
    ".cart__blocks",
  ];
  if (!selectorTargets.length) {
    selectorTargets = defaultWidgetTargets.slice();
  }

  var logUrl = (script.dataset.logUrl || "").trim();
  var logEnabled = String(script.dataset.logEnabled || "").toLowerCase() === "true";

  var updateTimeout;
  var isApplyingChanges = false;
  var lastUpdateAt = 0;
  var lastPostedCartSig = "";
  var logPostTimer;

  function uniqueElements(list) {
    var unique = [];
    list.forEach(function (item) {
      if (!item || !(item instanceof Element)) return;
      if (unique.indexOf(item) === -1) unique.push(item);
    });
    return unique;
  }

  /** If both .drawer and .drawer__inner match, keep only the inner node so we render one bar / one name row. */
  function keepDeepestHosts(hosts) {
    return hosts.filter(function (h) {
      return !hosts.some(function (o) {
        return o !== h && o.contains(h);
      });
    });
  }

  function formatMoney(cents, shopifyMoneyFormat) {
    var money = cents / 100;
    try {
      return Shopify.formatMoney(cents, shopifyMoneyFormat || window.Shopify?.money_format);
    } catch (e) {
      return "$" + money.toFixed(2);
    }
  }

  function parseTiers(raw, defaultShippingCents) {
    var fallback = [
      { minCents: thresholdCents, maxCents: null, shippingCents: 0, message: reachedText }
    ];
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return fallback;
      var normalized = parsed
        .map(function (tier) {
          var min = Number(tier && tier.min);
          var max = tier && tier.max != null ? Number(tier.max) : null;
          var shipping = Number(tier && tier.shipping);
          var message = tier && tier.message ? String(tier.message) : "";
          return {
            minCents: Number.isFinite(min) ? Math.max(0, Math.round(min * 100)) : 0,
            maxCents: Number.isFinite(max) ? Math.max(0, Math.round(max * 100)) : null,
            shippingCents: Number.isFinite(shipping)
              ? Math.max(0, Math.round(shipping * 100))
              : defaultShippingCents,
            message: message,
          };
        })
        .filter(function (tier) {
          return tier.maxCents == null || tier.maxCents >= tier.minCents;
        })
        .sort(function (a, b) {
          return a.minCents - b.minCents;
        });
      return normalized.length ? normalized : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function firstFreeTierMinCents() {
    for (var i = 0; i < tiers.length; i += 1) {
      if (tiers[i].shippingCents === 0) return tiers[i].minCents;
    }
    return thresholdCents;
  }

  /** Dynamic tier targets for UI progress: Tier 1 (discount), Tier 2 (free shipping). */
  function getSequentialTargetsCents() {
    var mins = tiers
      .map(function (tier) {
        return Number(tier && tier.minCents);
      })
      .filter(function (v) {
        return Number.isFinite(v) && v > 0;
      })
      .sort(function (a, b) {
        return a - b;
      });

    var tier1 = mins.length ? mins[0] : thresholdCents;
    var tier2 = mins.length > 1 ? mins[1] : firstFreeTierMinCents();
    if (!Number.isFinite(tier2) || tier2 <= 0) tier2 = tier1 > 0 ? tier1 : 1;
    if (tier2 < tier1) tier2 = tier1;
    return { tier1Cents: tier1, tier2Cents: tier2 };
  }

  function resolveTier(subtotalCents) {
    for (var i = 0; i < tiers.length; i += 1) {
      var tier = tiers[i];
      if (subtotalCents < tier.minCents) continue;
      if (tier.maxCents == null || subtotalCents <= tier.maxCents) return tier;
    }
    return null;
  }

  function getCartSubtotalCents(cart) {
    if (typeof cart?.items_subtotal_price === "number") return cart.items_subtotal_price;
    if (typeof cart?.total_price === "number") return cart.total_price;
    return 0;
  }

  function getSequentialLevelFromCart(cart) {
    if (!cart || !cart.attributes) return 0;
    var raw = cart.attributes[unlockAttributeKey];
    if (raw == null || raw === "") return 0;
    var n = parseInt(String(raw).trim(), 10);
    if (n === 1 || n === 2) return n;
    return 0;
  }

  var sequentialClickBound = false;
  function bindSequentialUnlockClicks() {
    if (sequentialClickBound || !sequentialMode) return;
    sequentialClickBound = true;
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest(".sce-tier-unlock-btn");
      if (!btn || btn.disabled || btn.classList.contains("is-done")) return;
      var widget = btn.closest(".sce-free-shipping-widget--sequential");
      if (!widget) return;
      var tier = btn.getAttribute("data-unlock-tier");
      if (tier !== "1" && tier !== "2") return;
      var key = widget.getAttribute("data-unlock-key") || unlockAttributeKey;
      e.preventDefault();
      btn.classList.add("is-loading");
      var payload = {};
      payload[key] = tier;
      fetch("/cart/update.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: payload }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Cart update failed");
          return r.json();
        })
        .then(function () {
          debouncedUpdate();
        })
        .catch(function () {
          /* ignore */
        })
        .finally(function () {
          btn.classList.remove("is-loading");
        });
    });
  }

  /** 2-step tier progress UI: discount -> free shipping. */
  var SEQUENTIAL_WIDGET_INNER =
    '<div class="sce-free-shipping-widget__title sce-seq-title"></div>' +
    '<div class="sce-free-shipping-widget__message sce-seq-message"></div>' +
    '<div class="sce-free-shipping-widget__bar sce-seq-main-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
    '<div class="sce-free-shipping-widget__bar-fill sce-seq-main-bar-fill"></div>' +
    "</div>" +
    '<div class="sce-seq-steps">' +
    '<div class="sce-seq-step" data-tier-step="1">' +
    '<div class="sce-seq-step__icon-wrap"><span class="sce-seq-step__dot"></span><span class="sce-seq-step__icon" aria-hidden="true">%</span></div>' +
    '<div class="sce-seq-step__label"></div>' +
    '<div class="sce-seq-step__sub"></div>' +
    "</div>" +
    '<div class="sce-seq-step" data-tier-step="2">' +
    '<div class="sce-seq-step__icon-wrap"><span class="sce-seq-step__dot"></span><span class="sce-seq-step__icon" aria-hidden="true">🚚</span></div>' +
    '<div class="sce-seq-step__label"></div>' +
    '<div class="sce-seq-step__sub"></div>' +
    "</div>" +
    "</div>" +
    '<div class="sce-free-shipping-widget__hint sce-seq-hint"></div>';

  function renderSequentialWidget(host, cart) {
    if (!host) return;
    bindSequentialUnlockClicks();

    var level = getSequentialLevelFromCart(cart);
    var subtotalCents = getCartSubtotalCents(cart);
    var targets = getSequentialTargetsCents();
    var tier1Complete = level >= 1 || subtotalCents >= targets.tier1Cents;
    var tier2Eligible = tier1Complete;
    var tier2Complete = tier2Eligible && (level >= 2 || subtotalCents >= targets.tier2Cents);
    var progressPct = tier2Complete ? 100 : tier1Complete ? 50 : 0;

    var root = host.classList.contains("sce-free-shipping-widget")
      ? host
      : host.querySelector(".sce-free-shipping-widget");
    if (!root) {
      root = document.createElement("div");
      root.className = "sce-free-shipping-widget sce-free-shipping-widget--sequential";
      root.innerHTML = SEQUENTIAL_WIDGET_INNER;
    } else if (!root.querySelector(".sce-seq-main-bar")) {
      root.className = "sce-free-shipping-widget sce-free-shipping-widget--sequential";
      root.innerHTML = SEQUENTIAL_WIDGET_INNER;
    }

    root.classList.add("sce-free-shipping-widget--sequential");
    root.setAttribute("data-unlock-key", unlockAttributeKey);
    placeWidget(host, root);

    var titleEl = root.querySelector(".sce-seq-title");
    var messageEl = root.querySelector(".sce-seq-message");
    var barFill = root.querySelector(".sce-seq-main-bar-fill");
    var mainBar = root.querySelector(".sce-seq-main-bar");
    var tierStep1 = root.querySelector('[data-tier-step="1"]');
    var tierStep2 = root.querySelector('[data-tier-step="2"]');
    var step1Label = tierStep1 ? tierStep1.querySelector(".sce-seq-step__label") : null;
    var step2Label = tierStep2 ? tierStep2.querySelector(".sce-seq-step__label") : null;
    var step1Sub = tierStep1 ? tierStep1.querySelector(".sce-seq-step__sub") : null;
    var step2Sub = tierStep2 ? tierStep2.querySelector(".sce-seq-step__sub") : null;
    var hint = root.querySelector(".sce-seq-hint");

    if (titleEl) titleEl.textContent = sequentialTitle;

    if (messageEl) {
      if (tier2Complete) messageEl.textContent = sequentialMsg2;
      else if (tier1Complete) messageEl.textContent = sequentialMsg1;
      else messageEl.textContent = sequentialMsg0;
    }

    if (barFill) {
      var visibleBar = progressPct > 0 ? Math.max(progressPct, 3) : 0;
      barFill.style.width = visibleBar + "%";
      barFill.classList.toggle("is-active", progressPct > 0);
    }
    if (mainBar) mainBar.setAttribute("aria-valuenow", String(progressPct));

    if (step1Label) step1Label.textContent = tier1Label;
    if (step2Label) step2Label.textContent = tier2Label;
    if (step1Sub) step1Sub.textContent = tier1TagText;
    if (step2Sub) step2Sub.textContent = tier2TagText;

    if (tierStep1) {
      tierStep1.classList.toggle("is-complete", tier1Complete);
      tierStep1.classList.toggle("is-active", !tier1Complete);
    }
    if (tierStep2) {
      tierStep2.classList.toggle("is-enabled", tier2Eligible);
      tierStep2.classList.toggle("is-complete", tier2Complete);
      tierStep2.classList.toggle("is-active", tier2Eligible && !tier2Complete);
    }

    if (hint) {
      var subLabel = formatMoney(subtotalCents);
      var shipLabel = formatMoney(shippingChargeCents);
      if (tier2Complete) {
        hint.textContent =
          "Current subtotal: " + subLabel + " · " + sequentialMsg2;
      } else if (tier1Complete) {
        hint.textContent =
          "Current subtotal: " +
          subLabel +
          " (Estimated shipping: " +
          shipLabel +
          ") · " +
          sequentialHintMid;
      } else {
        hint.textContent =
          "Current subtotal: " +
          subLabel +
          " (Estimated shipping: " +
          shipLabel +
          ") · " +
          sequentialHintZero;
      }
    }
  }

  function getWidgetMountPoint(host) {
    var drawerRoot = host.closest("cart-drawer, .cart-drawer, .drawer, [id*='CartDrawer']") || host;
    var header = drawerRoot.querySelector(".drawer__header, .cart-drawer__header, .ajaxcart__header, header");
    var items = drawerRoot.querySelector(".drawer__inner, .cart-drawer__items, .ajaxcart__inner, form[action*='/cart']");

    if (header && header.parentElement) {
      return { container: header.parentElement, before: header.nextElementSibling };
    }

    if (items && items.parentElement) {
      return { container: items.parentElement, before: items };
    }

    var footer = drawerRoot.querySelector(".drawer__footer, .cart-drawer__footer, .ajaxcart__footer, .cart__footer");
    if (footer && footer.parentElement) {
      return { container: footer.parentElement, before: footer };
    }

    return { container: host, before: null };
  }

  function placeWidget(host, root) {
    var mount = getWidgetMountPoint(host);
    if (!mount || !mount.container) return;

    if (mount.before) {
      mount.container.insertBefore(root, mount.before);
      return;
    }

    mount.container.appendChild(root);
  }

  function renderWidget(host, cart) {
    if (!host) return;

    var subtotal = getCartSubtotalCents(cart);
    var freeThresholdCents = firstFreeTierMinCents();
    var remaining = Math.max(0, freeThresholdCents - subtotal);
    var matchedTier = resolveTier(subtotal);
    var reached = !!matchedTier && matchedTier.shippingCents === 0;
    var hasChargeTier = !!matchedTier && matchedTier.shippingCents > 0;
    var effectiveShippingCents = matchedTier ? matchedTier.shippingCents : shippingChargeCents;
    var progress =
      freeThresholdCents > 0
        ? Math.min(100, Math.round((subtotal / freeThresholdCents) * 100))
        : 0;

    var root = host.classList.contains("sce-free-shipping-widget")
      ? host
      : host.querySelector(".sce-free-shipping-widget");
    if (!root) {
      root = document.createElement("div");
      root.className = "sce-free-shipping-widget";
      root.innerHTML =
        '<div class="sce-free-shipping-widget__title"></div>' +
        '<div class="sce-free-shipping-widget__message"></div>' +
        '<div class="sce-free-shipping-widget__bar"><div class="sce-free-shipping-widget__bar-fill"></div></div>' +
        '<div class="sce-free-shipping-widget__milestones">' +
          '<span class="sce-milestone" data-step="25">25%</span>' +
          '<span class="sce-milestone" data-step="50">50%</span>' +
          '<span class="sce-milestone" data-step="100">Free</span>' +
        '</div>' +
        '<div class="sce-free-shipping-widget__hint"></div>';
    }
    placeWidget(host, root);

    var title = root.querySelector(".sce-free-shipping-widget__title");
    var message = root.querySelector(".sce-free-shipping-widget__message");
    var barFill = root.querySelector(".sce-free-shipping-widget__bar-fill");
    var hint = root.querySelector(".sce-free-shipping-widget__hint");
    var milestones = root.querySelectorAll(".sce-milestone");

    var thresholdLabel = formatMoney(freeThresholdCents);
    if (title) title.textContent = titleText;
    if (message) {
      var tierMessage = matchedTier && matchedTier.message ? matchedTier.message : "";
      message.textContent = reached
        ? (tierMessage || reachedText)
        : hasChargeTier
          ? (tierMessage || chargedText).split("[shipping_amount]").join(formatMoney(effectiveShippingCents))
        : progressText
            .split("[remaining_amount]")
            .join(formatMoney(remaining))
            .split("[threshold]")
            .join(thresholdLabel);
    }
    if (barFill) {
      var visibleProgress = progress > 0 ? Math.max(progress, 3) : 0;
      barFill.style.width = visibleProgress + "%";
      barFill.classList.toggle("is-active", progress > 0);
      barFill.setAttribute("aria-valuenow", String(progress));
    }
    milestones.forEach(function (milestone) {
      var step = Number(milestone.getAttribute("data-step") || 0);
      milestone.classList.toggle("is-active", progress >= step);
    });

    if (hint) {
      if (reached) {
        hint.textContent = effectiveShippingCents > 0
          ? "Shipping saved: " + formatMoney(effectiveShippingCents)
          : "";
      } else if (hasChargeTier) {
        hint.textContent = "Current subtotal: " + formatMoney(subtotal) + " (Shipping: " + formatMoney(effectiveShippingCents) + ")";
      } else {
        var hintText = "Current subtotal: " + formatMoney(subtotal) + " / " + formatMoney(freeThresholdCents);
        if (effectiveShippingCents > 0) {
          hintText += " (Estimated shipping: " + formatMoney(effectiveShippingCents) + ")";
        }
        hint.textContent = hintText;
      }
    }
  }

  function renderCartName(host) {
    if (!host || !cartNameText) return;

    var header = host.querySelector(".sce-cart-user-name");
    if (!header) {
      header = document.createElement("div");
      header.className = "sce-cart-user-name";

      var heading = host.querySelector("h1, h2, h3, .drawer__heading, .cart__heading");
      if (heading && heading.parentNode === host) {
        heading.insertAdjacentElement("afterend", header);
      } else {
        host.prepend(header);
      }
    }

    header.textContent = cartNameText;
  }

  function renderNameInCartHeadings() {
    if (!cartNameText) return;

    var headings = document.querySelectorAll("h1, h2, h3, .drawer__heading, .cart__heading");
    headings.forEach(function (heading) {
      var text = (heading.textContent || "").trim();
      if (!/your cart|cart/i.test(text)) return;

      var inline = heading.querySelector(".sce-cart-user-name-inline");
      if (!inline) {
        inline = document.createElement("span");
        inline.className = "sce-cart-user-name-inline";
        heading.appendChild(inline);
      }
      inline.textContent = " - " + cartNameText;
    });
  }

  function fetchCart() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Cart fetch failed");
      return r.json();
    });
  }

  function postCartAccessLog(cart) {
    if (!logEnabled || !logUrl || !cart) return;

    var subtotal =
      typeof cart.items_subtotal_price === "number"
        ? cart.items_subtotal_price
        : typeof cart.total_price === "number"
          ? cart.total_price
          : 0;
    var sig = String(cart.item_count || 0) + "_" + String(subtotal);
    if (sig === lastPostedCartSig) return;
    lastPostedCartSig = sig;

    window.clearTimeout(logPostTimer);
    logPostTimer = window.setTimeout(function () {
      fetch(logUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_count: cart.item_count,
          items_subtotal_price: subtotal,
          currency: cart.currency,
          pathname: window.location.pathname,
          source: "smart_cart_extension",
        }),
      }).catch(function () {
        /* ignore log failures */
      });
    }, 400);
  }

  function getHosts() {
    var hosts = [];
    selectorTargets.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        hosts.push(el);
      });
    });
    return uniqueElements(hosts);
  }

  function getNameHosts() {
    var hosts = [];
    nameTargetSelectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        hosts.push(el);
      });
    });

    hosts = uniqueElements(hosts);

    if (!hosts.length) {
      var cartHeading = Array.prototype.find.call(
        document.querySelectorAll("h1, h2, h3"),
        function (el) {
          return /your cart|cart/i.test((el.textContent || "").trim());
        }
      );
      if (cartHeading && cartHeading.parentElement) {
        hosts.push(cartHeading.parentElement);
      }
    }

    if (!hosts.length && /\/cart($|\?)/.test(window.location.pathname)) {
      var cartPageFallback = document.querySelector("main, #MainContent, .main-content, .template-cart");
      if (cartPageFallback) {
        hosts.push(cartPageFallback);
      }
    }

    if (!hosts.length) {
      var drawerFallback = document.querySelector(
        "[id*='CartDrawer'], [class*='cart-drawer'], [class*='drawer']"
      );
      if (drawerFallback) {
        hosts.push(drawerFallback);
      }
    }

    return uniqueElements(hosts);
  }

  function isCartRelatedElement(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest(".sce-free-shipping-widget, .sce-cart-user-name, .sce-cart-user-name-inline")) return false;

    if (
      el.matches("form[action*='/cart'], cart-drawer, [id*='CartDrawer'], [class*='cart-drawer'], [class*='drawer']") ||
      el.querySelector("form[action*='/cart'], cart-drawer, [id*='CartDrawer'], [class*='cart-drawer'], [class*='drawer']")
    ) {
      return true;
    }

    var combined = ((el.textContent || "") + " " + (el.className || "") + " " + (el.id || "")).toLowerCase();
    return combined.indexOf("cart") !== -1;
  }

  function update() {
    isApplyingChanges = true;
    renderNameInCartHeadings();
    keepDeepestHosts(getNameHosts()).forEach(function (host) {
      renderCartName(host);
    });
    isApplyingChanges = false;

    var needWidget = selectorTargets.length > 0;
    var needLog = logEnabled && !!logUrl;

    if (!needWidget && !needLog) return;

    fetchCart()
      .then(function (cart) {
        if (needLog) postCartAccessLog(cart);
        if (needWidget) {
          keepDeepestHosts(getHosts()).forEach(function (host) {
            if (sequentialMode) {
              renderSequentialWidget(host, cart);
            } else {
              renderWidget(host, cart);
            }
          });
        }
      })
      .catch(function () {
        /* ignore cart fetch failures */
      });
  }

  function debouncedUpdate() {
    window.clearTimeout(updateTimeout);
    updateTimeout = window.setTimeout(update, 250);
  }

  document.addEventListener("DOMContentLoaded", update);
  document.addEventListener("cart:updated", debouncedUpdate);
  document.addEventListener("ajaxProduct:added", debouncedUpdate);
  document.addEventListener("change", function (e) {
    var target = e.target;
    if (target && target.closest('form[action*="/cart"]')) {
      debouncedUpdate();
    }
  });
  document.addEventListener("click", function (e) {
    var target = e.target;
    if (target && target.closest('form[action*="/cart"], cart-drawer, [id*="CartDrawer"], [class*="cart-drawer"]')) {
      debouncedUpdate();
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) debouncedUpdate();
  });
  window.addEventListener("focus", debouncedUpdate);

  var observer = new MutationObserver(function (mutations) {
    if (isApplyingChanges) return;

    var now = Date.now();
    if (now - lastUpdateAt < 500) return;

    var shouldUpdate = mutations.some(function (mutation) {
      if (mutation.type === "characterData") {
        var p = mutation.target && mutation.target.parentElement;
        if (p && isCartRelatedElement(p)) return true;
      }
      if (isCartRelatedElement(mutation.target)) return true;
      for (var i = 0; i < mutation.addedNodes.length; i += 1) {
        if (isCartRelatedElement(mutation.addedNodes[i])) return true;
      }
      return false;
    });

    if (!shouldUpdate) return;
    lastUpdateAt = now;
    debouncedUpdate();
  });
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });

  // Safety sync for themes that update cart text without reliable events.
  window.setInterval(function () {
    var cartOpen = document.querySelector("cart-drawer[open], .cart-drawer.is-open, #CartDrawer:not([aria-hidden='true']), form[action='/cart']");
    if (cartOpen) debouncedUpdate();
  }, 3000);
})();
