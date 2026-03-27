(function () {
  var script = document.currentScript;
  if (!script) return;

  var thresholdValue = Number(script.dataset.threshold || 0);
  var thresholdCents = Math.max(0, Math.round(thresholdValue * 100));
  var shippingChargeValue = Number(script.dataset.shippingCharge || 0);
  var shippingChargeCents = Math.max(0, Math.round(shippingChargeValue * 100));
  var titleText = script.dataset.title || "Free shipping progress";
  var progressText = script.dataset.progressText || "Spend [remaining_amount] more for free shipping.";
  var reachedText = script.dataset.reachedText || "You unlocked free shipping!";
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

  function getCartSubtotalCents(cart) {
    if (typeof cart?.items_subtotal_price === "number") return cart.items_subtotal_price;
    if (typeof cart?.total_price === "number") return cart.total_price;
    return 0;
  }

  function renderWidget(host, cart) {
    if (!host) return;

    var subtotal = getCartSubtotalCents(cart);
    var remaining = Math.max(0, thresholdCents - subtotal);
    var reached = thresholdCents > 0 && subtotal >= thresholdCents;
    var progress =
      thresholdCents > 0
        ? Math.min(100, Math.round((subtotal / thresholdCents) * 100))
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
      host.prepend(root);
    }

    var title = root.querySelector(".sce-free-shipping-widget__title");
    var message = root.querySelector(".sce-free-shipping-widget__message");
    var barFill = root.querySelector(".sce-free-shipping-widget__bar-fill");
    var hint = root.querySelector(".sce-free-shipping-widget__hint");
    var milestones = root.querySelectorAll(".sce-milestone");

    var thresholdLabel = formatMoney(thresholdCents);
    if (title) title.textContent = titleText;
    if (message) {
      message.textContent = reached
        ? reachedText
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
        hint.textContent = shippingChargeCents > 0
          ? "Shipping saved: " + formatMoney(shippingChargeCents)
          : "";
      } else {
        var hintText = "Current subtotal: " + formatMoney(subtotal) + " / " + formatMoney(thresholdCents);
        if (shippingChargeCents > 0) {
          hintText += " (Estimated shipping: " + formatMoney(shippingChargeCents) + ")";
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

    var needWidget = thresholdCents > 0 && selectorTargets.length > 0;
    var needLog = logEnabled && !!logUrl;

    if (!needWidget && !needLog) return;

    fetchCart()
      .then(function (cart) {
        if (needLog) postCartAccessLog(cart);
        if (needWidget) {
          keepDeepestHosts(getHosts()).forEach(function (host) {
            renderWidget(host, cart);
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
