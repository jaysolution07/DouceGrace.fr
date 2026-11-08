
// ══════════════════════════════════
//  CONFIG — colle ton URL Apps Script ici après déploiement
// ══════════════════════════════════
const GAS_URL = "https://script.google.com/macros/s/AKfycbzC2zM9G4rgXWK5YyFpIw4b6xQDciw_FbMvZ3Sq_oefyeXOGTHBIh-xzUW-f4bc4NLw/exec";

// Convertit toute URL Google Drive en URL d'image directe (lh3 = sans redirection)
function imgSrc(url, width) {
  url = String(url || '').trim();
  if (!url) return '';
  let m = url.match(new RegExp('/file/d/([a-zA-Z0-9_-]+)'));
  if (!m) m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!m) m = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1] + (width ? '=w' + width : '');
  return url;
}
// Secours : si l'image ne charge pas, on affiche l'emoji à la place
function imgFail(img, emoji) {
  img.onerror = null;
  const ph = document.createElement('div');
  ph.className = 'product-img-placeholder';
  ph.textContent = emoji || img.dataset.emoji || '🧵';
  img.replaceWith(ph);
}

// ══════════════════════════════════
const FABRICS = [
  { name:"Wax Indigo",   color:"#3a5f8a" },
  { name:"Wax Ocre",     color:"#c8942a" },
  { name:"Coton Rose",   color:"#e8a0b0" },
  { name:"Lin Naturel",  color:"#c9b49a" },
  { name:"Soie Ivoire",  color:"#f5efe6" },
  { name:"Velours Nuit", color:"#2e3f6e" },
  { name:"Coton Blanc",  color:"#f0f0f0" },
  { name:"Satin Rouge",  color:"#c0392b" },
  { name:"Tissu Vert",   color:"#2e7d52" },
];

let PRODUCTS = [];
let FABRIC_CATALOG = [];
let isLoadingProducts = true;
// ── CACHE LOCAL DU CATALOGUE ─────────────────────────────────────────────
// Le catalogue est gardé sur l'appareil : à la visite suivante il s'affiche
// tout de suite, puis se met à jour en arrière-plan pendant que la page est lue.
const CACHE_PRODUITS = 'doucegrace_produits_v1';
const CACHE_TISSUS = 'doucegrace_tissus_v1';
const DELAI_MAX = 15000; // au-delà, on prévient au lieu de laisser la grille vide

function lireCache(cle) {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return null;
    const data = JSON.parse(brut);
    return data && Array.isArray(data.items) && data.items.length ? data : null;
  } catch (e) { return null; }
}
function ecrireCache(cle, items, extra) {
  try {
    localStorage.setItem(cle, JSON.stringify(Object.assign({ items: items, at: Date.now() }, extra || {})));
  } catch (e) { /* stockage plein ou bloqué : on continue sans cache */ }
}

// Récupère du JSON avec un délai maximal, pour ne jamais attendre indéfiniment
function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const minuteur = setTimeout(() => {
      if (ctrl) ctrl.abort();
      reject(new Error('Délai dépassé'));
    }, timeoutMs || DELAI_MAX);
    fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(res => res.json())
      .then(data => { clearTimeout(minuteur); resolve(data); })
      .catch(err => { clearTimeout(minuteur); reject(err); });
  });
}

// Message clair + bouton si le serveur ne répond pas, au lieu d'une page vide
function erreurGrille(gridId, titre, relance) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  window.__relanceGrille = relance;
  grid.innerHTML =
    '<div class="no-results">' + titre + '<br>' +
    '<span style="font-size:13px;opacity:.75">La connexion est peut-être lente. Réessayez dans un instant.</span>' +
    '<br><button class="btn btn-outline" style="margin-top:18px" onclick="relancerGrille()">↻ Réessayer</button></div>';
}
function relancerGrille() {
  if (typeof window.__relanceGrille === 'function') window.__relanceGrille();
}

// Catégories du menu déroulant, gardées d'une visite à l'autre
function appliquerCategories(categories) {
  const catSelect = document.getElementById('category-select');
  if (!catSelect || !Array.isArray(categories)) return;
  catSelect.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Toutes les catégories';
  catSelect.appendChild(allOpt);
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
  // on conserve la catégorie choisie si elle existe toujours
  catSelect.value = categories.includes(activeFilter) ? activeFilter : '';
  activeFilter = catSelect.value;
}

async function loadProductsFromSheet() {
  const cache = lireCache(CACHE_PRODUITS);
  if (cache) {
    // Affichage immédiat de la dernière version connue
    PRODUCTS = cache.items;
    isLoadingProducts = false;
    appliquerCategories(cache.categories);
    renderProducts();
  } else {
    isLoadingProducts = true;
    renderProducts(); // cartes fantômes tout de suite
  }

  try {
    const data = await fetchJson(GAS_URL + "?action=getProducts", DELAI_MAX);
    PRODUCTS = data.apps || [];
    isLoadingProducts = false;
    appliquerCategories(data.categories);
    ecrireCache(CACHE_PRODUITS, PRODUCTS, { categories: data.categories || [] });
    renderProducts();
  } catch (e) {
    console.error("Erreur chargement produits", e);
    isLoadingProducts = false;
    if (!PRODUCTS.length) {
      erreurGrille('products-grid', "Les créations n'arrivent pas pour le moment.", loadProductsFromSheet);
    }
  }
}
async function loadFabricsFromSheet() {
  const cache = lireCache(CACHE_TISSUS);
  if (cache) {
    FABRIC_CATALOG = cache.items;
    renderFabrics();
  } else {
    renderFabrics(); // tuiles fantômes tout de suite
  }

  try {
    const data = await fetchJson(GAS_URL + "?action=getFabrics", DELAI_MAX);
    FABRIC_CATALOG = data.fabrics || [];
    ecrireCache(CACHE_TISSUS, FABRIC_CATALOG);
    renderFabrics();
  } catch (e) {
    console.error("Erreur chargement tissus", e);
    if (!FABRIC_CATALOG.length) {
      erreurGrille('fabrics-grid', "Les tissus n'arrivent pas pour le moment.", loadFabricsFromSheet);
    }
  }
}
// ══════════════════════════════════
//  STATE
// ══════════════════════════════════
const CART_KEY = 'doucegrace_panier_v1';
let cart = [];
try {
  const savedCart = localStorage.getItem(CART_KEY);
  if (savedCart) cart = JSON.parse(savedCart) || [];
} catch (e) { cart = []; }
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
}
let activeFilter = "";
let selectedFabrics = {}; // {productId: fabricIndex}
let appliedPromo = null;
let appliedPromoCode = "";
let promoMessage = "";
// ── CONFIG LIVRAISON (lue depuis le backend, modifiable dans le portail admin) ──
let SHIP_CONFIG = { shippingFee: 5.99, freeShippingMin: 60 };
function computeShipping(subtotalAfterPromo) {
  return subtotalAfterPromo >= SHIP_CONFIG.freeShippingMin ? 0 : SHIP_CONFIG.shippingFee;
}
function cartSubtotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}
function cartAfterPromo() {
  const sub = cartSubtotal();
  return sub - (appliedPromo ? sub * (appliedPromo / 100) : 0);
}
function updateShipBanner() {
  const info = document.getElementById('ship-info');
  if (!info) return;
  const after = cartAfterPromo();
  if (after >= SHIP_CONFIG.freeShippingMin) {
    info.classList.add('free');
    info.innerHTML = '🎉 Livraison offerte sur votre commande !';
  } else {
    info.classList.remove('free');
    const rest = (SHIP_CONFIG.freeShippingMin - after).toFixed(2).replace('.', ',');
    info.innerHTML = "🚚 Livraison offerte dès " + String(SHIP_CONFIG.freeShippingMin).replace('.', ',') + " € d'achat" + (cart.length ? " — plus que " + rest + " €" : "") + " · France métropolitaine";
  }
}
async function loadShipConfig() {
  try {
    const data = await fetchJson(GAS_URL + '?action=getConfig', DELAI_MAX);
    if (data && data.shippingFee != null) SHIP_CONFIG = data;
    else {
      const garde = lireCache('doucegrace_livraison_v1');
      if (garde) SHIP_CONFIG = garde.items[0] || SHIP_CONFIG;
    }
  } catch (e) {
    console.warn('Config livraison indisponible', e);
    const garde = lireCache('doucegrace_livraison_v1');
    if (garde) SHIP_CONFIG = garde.items[0] || SHIP_CONFIG;
  }
  try { ecrireCache('doucegrace_livraison_v1', [SHIP_CONFIG]); } catch (e) {}
  const info = document.getElementById('ship-info');
  if (info) info.classList.add('show');
  document.body.classList.add('ship-info-on');
  updateShipBanner();
}
// ══════════════════════════════════
//  PAGE NAVIGATION
// ══════════════════════════════════
function toggleNav() {
  const links = document.querySelector('.nav-links');
  if (!links) return;
  const open = links.classList.toggle('open');
  const btn = document.querySelector('.nav-burger');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function showPage(name) {
  const pages = { home: '../', shop: '../boutique/', fabrics: '../tissus/' };
  if (pages[name]) window.location.href = pages[name];
}


// Prépare la liste des tissus pendant que l'accueil est lu : le clic vers
// /tissus/ trouve alors le catalogue déjà en cache.
function prechargerTissus() {
  const lancer = () => {
    if (document.getElementById('fabrics-grid')) return; // déjà affichés
    if (lireCache(CACHE_TISSUS)) return;                  // déjà en cache
    fetchJson(GAS_URL + '?action=getFabrics', DELAI_MAX)
      .then(data => ecrireCache(CACHE_TISSUS, data.fabrics || []))
      .catch(() => { /* silencieux : ce n'est qu'une avance */ });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(lancer, { timeout: 3000 });
  else setTimeout(lancer, 1200);
}

// Init on load
document.addEventListener('DOMContentLoaded', function() {
  observeReveal();

  updateCartUI();
  loadProductsFromSheet();
  // Tissus : chargés ici s'il y a une grille, sinon préparés en arrière-plan
  // pour que le clic vers /tissus/ soit instantané.
  if (document.getElementById('fabrics-grid')) loadFabricsFromSheet();
  else prechargerTissus();
  loadShipConfig();
  handleStripeReturn();
});

// ── RETOUR STRIPE (succès / annulation) ──
async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const sessionId = params.get('session_id');

  // Nettoyer l'URL (retire ?payment=... sans recharger)
  if (payment || sessionId) {
    const clean = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  }

  if (payment === 'cancel') {
    showToast('Paiement annulé — commande non enregistrée. Vous pouvez réessayer.', true);
    return;
  }
  if (payment === 'success' && sessionId) {
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'confirmOrder', session_id: sessionId })
      });
      const data = await res.json();
      if (data && data.success) {
        cart = [];
        updateCartUI();
        const overlay = document.getElementById('order-overlay');
        document.getElementById('order-modal-content').innerHTML = `
          <div class="success-state">
            <div class="success-icon">✅</div>
            <h3>Paiement confirmé !</h3>
            <p>Merci ! Votre commande <strong>${data.orderId || ''}</strong> a bien été réglée et enregistrée.<br><br>
Douce Grâce prépare votre commande et vous enverra un email de suivi pour la livraison.</p>
            <br>
            <button class="btn btn-primary" onclick="resetAfterOrder()" style="margin:0 auto;">Continuer mes achats →</button>
          </div>
        `;
        overlay.classList.add('active');
      } else {
        showToast('Paiement en attente de confirmation. Vérifiez votre email.', true);
      }
    } catch (e) {
      console.error('Erreur confirmation paiement', e);
      showToast('La confirmation du paiement a échoué. Contactez Douce Grâce.', true);
    }
  }
}


function scrollToContact() {
  const footer = document.querySelector('footer');
  if (footer) footer.scrollIntoView({ behavior: 'smooth' });
}

// ══════════════════════════════════
//  RENDER PRODUCTS
// ══════════════════════════════════
function stockLabel(p) {
  if (p.stock === null || p.stock === undefined) return '';
  if (p.stock <= 0) return '';
  if (p.stock <= 3) {
    return '<div style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#c0392b;">⚠️ Ne reste plus que ' + p.stock + ' en stock</div>';
  }
  return '<div style="margin:0 0 12px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#2e7d52;">✓ ' + p.stock + ' en stock</div>';
}
function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
if (isLoadingProducts) {
  grid.innerHTML = Array(6).fill('').map(() => `
    <div class="product-card" style="pointer-events:none;">
      <div class="product-img skeleton-box"></div>
      <div class="product-info">
        <div class="skeleton-line" style="width:30%;height:10px;margin-bottom:10px;"></div>
        <div class="skeleton-line" style="width:70%;height:24px;margin-bottom:10px;"></div>
        <div class="skeleton-line" style="width:100%;height:12px;margin-bottom:8px;"></div>
        <div class="skeleton-line" style="width:80%;height:12px;margin-bottom:18px;"></div>
        <div class="skeleton-line" style="width:40%;height:28px;margin-bottom:18px;"></div>
        <div class="skeleton-line" style="width:100%;height:42px;border-radius:50px;"></div>
      </div>
    </div>
  `).join('');
  return;
}
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = PRODUCTS.filter(p =>
    (!activeFilter || p.cat === activeFilter) &&
    (!search || p.name.toLowerCase().includes(search) || p.desc.toLowerCase().includes(search))
  );

  if (!filtered.length) {
    grid.innerHTML = '<div class="no-results">Aucune création trouvée… 🌸</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const selFabric = selectedFabrics[p.id] !== undefined ? selectedFabrics[p.id] : null;
   const swatches = p.custom && p.fabrics?.length ? `
  <div class="fabric-section">
    <div class="fabric-label">Tissu disponible</div>
    <div style="font-size:14px;color:var(--text-light);line-height:1.8;">
      🧵 ${p.fabrics.join(', ')}
    </div>
  </div>` : '';

    return `
      <div class="product-card" onclick="${p.outOfStock ? '' : `openDetail('${p.id}')`}" style="${p.outOfStock ? 'opacity:0.5;filter:grayscale(1);' : ''}">
        <div class="product-img">
  ${p.image
    ? `<img src="${imgSrc(p.image, 500)}" alt="${p.name}" data-emoji="${p.emoji || '🧵'}" loading="lazy" decoding="async" onerror="imgFail(this)">`
    : `<div class="product-img-placeholder">${p.emoji}</div>`}
  ${(p.images && p.images.length > 1) ? '<span class="product-badge photos">📷 ' + p.images.length + '</span>' : ''}
  ${p.custom ? '<span class="product-badge custom">Tissu au choix</span>' : ''}
  ${p.outOfStock ? '<span class="product-badge custom" style="top:44px;">Rupture de stock</span>' : ''}
</div>
        <div class="product-info">
          <div class="product-cat">${p.cat}</div>
          <h2 class="product-name">${p.name}</h2>
          <div class="product-desc">${p.desc}</div>
          ${swatches}
          <div class="product-price">${p.price} €</div>
          ${stockLabel(p)}
          <div class="product-actions" onclick="event.stopPropagation()">
  <button 
    class="btn btn-primary"
    onclick="${p.outOfStock ? '' : `openDetail('${p.id}')`}"
    ${p.outOfStock ? 'disabled' : ''}
    style="${p.outOfStock ? 'opacity:0.5;cursor:not-allowed;background:#999;' : ''}"
  >
    ${p.outOfStock ? '❌ Indisponible' : '🛒 Ajouter au panier'}
  </button>
</div>
        </div>
      </div>
    `;
  }).join('');

  observeReveal();
}
function renderFabrics() {
  const grid = document.getElementById('fabrics-grid');
  if (!grid) return;

  if (!FABRIC_CATALOG.length) {
    grid.innerHTML = Array(6).fill('').map(() => `
      <div class="product-card" style="pointer-events:none;">
        <div class="product-img skeleton-box"></div>
        <div class="product-info">
          <div class="skeleton-line" style="width:70%;height:24px;margin-bottom:10px;"></div>
          <div class="skeleton-line" style="width:100%;height:12px;margin-bottom:8px;"></div>
          <div class="skeleton-line" style="width:80%;height:12px;"></div>
        </div>
      </div>
    `).join('');
    return;
  }

  grid.innerHTML = FABRIC_CATALOG.map(f => `
    <div class="product-card" style="${!f.active ? 'opacity:0.5;filter:grayscale(1);' : ''}">
      <div class="product-img">
        ${
          f.image
            ? `<img src="${imgSrc(f.image, 500)}" alt="${f.name}" loading="lazy" decoding="async" onerror="imgFail(this,'🧵')">`
            : `<div class="product-img-placeholder">🧵</div>`
        }
        ${!f.active ? '<span class="product-badge custom">Rupture de stock</span>' : ''}
      </div>
      <div class="product-info">
        <h2 class="product-name">${f.name}</h2>
        <div class="product-desc">
          ${f.desc}${f.cat ? ` <span style="font-style:italic;">(${f.cat})</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}
function selectFabric(e, productId, fabricIdx) {
  e.stopPropagation();
  selectedFabrics[productId] = fabricIdx;
  renderProducts();
}

function setFilter(select) {
  activeFilter = select.value;
  filterProducts();
}

function filterProducts() {
  renderProducts();
}

// ══════════════════════════════════
//  CART
// ══════════════════════════════════
function applyPromoCode() {
  const input = document.getElementById("promo-code");
  if (!input) return;

  const code = input.value.trim().toUpperCase();
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const promoProduct = PRODUCTS.find(p =>
    p.promoCode &&
    p.promoCode.toUpperCase() === code
  );

  if (!promoProduct) {
    appliedPromo = null;
    promoMessage = "❌ Code promo invalide";
    renderCartPanel();
    return;
  }

  if (!promoProduct.promoActive) {
    appliedPromo = null;
    promoMessage = "❌ Code inactif";
    renderCartPanel();
    return;
  }

  const min = promoProduct.promoMin || 0;

  if (subtotal < min) {
    appliedPromo = null;
    promoMessage = `❌ Valable à partir de ${min}€`;
    renderCartPanel();
    return;
  }

  appliedPromo = promoProduct.promoReduction;
appliedPromoCode = code;
promoMessage = `✅ -${promoProduct.promoReduction}% appliqué`;
renderCartPanel();
}
function addToCart(productId) {
  const p = PRODUCTS.find(x => String(x.id) === String(productId));
  if (p && p.stock !== null && p.stock !== undefined && p.stock <= 0) {
    showToast('❌ Ce produit est en rupture de stock', true);
    return;
  }
  if (p && p.stock !== null && p.stock !== undefined) {
    const inCart = cart.filter(i => String(i.id) === String(productId)).reduce((s, i) => s + i.qty, 0);
    if (inCart >= p.stock) { showToast('⚠️ Stock limité : plus que ' + p.stock + ' disponible(s)', true); return; }
  }
  const fabric = selectedFabrics[productId] || [];
  const existing = cart.find(i => i.id === productId && i.fabricIdx === selectedFabrics[productId]);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: productId, name: p.name, price: p.price, emoji: p.emoji, qty: 1,
      image: p.image || '',
      custom: !!p.custom,
      fabric: fabric.length ? fabric.join(', ') : null,
fabricColor: null,
      fabricIdx: selectedFabrics[productId] !== undefined ? selectedFabrics[productId] : null
    });
  }
  updateCartUI();
  // flash the cart button
  const btn = document.querySelector('.cart-btn');
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 300);
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  updateCartUI();
  renderCartPanel();
}

function changeQty(idx, delta) {
  const item = cart[idx];
  if (delta > 0) {
    const p = PRODUCTS.find(x => String(x.id) === String(item.id));
    if (p && p.stock !== null && p.stock !== undefined) {
      const inCart = cart.filter(i => String(i.id) === String(item.id)).reduce((s, i) => s + i.qty, 0);
      if (inCart >= p.stock) { showToast('⚠️ Stock limité : plus que ' + p.stock + ' disponible(s)', true); return; }
    }
  }
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCartUI();
  renderCartPanel();
}

function updateCartUI() {
  saveCart();
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cart-count');
  countEl.textContent = total;
  countEl.classList.toggle('visible', total > 0);
  renderCartPanel();
}

function imgPanierFail(img) {
  img.onerror = null;
  const span = document.createElement('span');
  span.style.fontSize = '24px';
  span.textContent = img.dataset.emoji || '🧵';
  img.replaceWith(span);
}

function renderCartPanel() {
  const el = document.getElementById('cart-items');
  const foot = document.getElementById('cart-foot');

  if (!cart.length) {
    el.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🧺</div>
        <p>Votre panier est vide</p>
      </div>`;
    foot.style.display = 'none';
    updateShipBanner();
    return;
  }

  foot.style.display = 'block';
  el.innerHTML = cart.map((item, idx) => {
    // Article du stock : on montre sa photo, et on ne parle pas de tissu.
    const prod = PRODUCTS.find(x => String(x.id) === String(item.id));
    const image = item.image || (prod && prod.image) || '';
    const surMesure = item.custom !== undefined ? item.custom : !!(prod && prod.custom);
    const tissu = item.fabric ? '🎨 ' + item.fabric : (surMesure ? 'Tissu non sélectionné' : '');
    return `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.fabricColor
          ? `<div style="width:100%;height:100%;background:${item.fabricColor};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;">${item.emoji}</div>`
          : (image
              ? `<img src="${imgSrc(image, 160)}" alt="${item.name}" loading="lazy" decoding="async" data-emoji="${item.emoji || '🧵'}" onerror="imgPanierFail(this)">`
              : (item.emoji || '🧵'))}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        ${tissu ? '<div class="cart-item-detail">' + tissu + '</div>' : ''}
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
          <button class="cart-item-remove" onclick="removeFromCart(${idx})">🗑</button>
        </div>
      </div>
      <div class="cart-item-price">${item.price * item.qty} €</div>
    </div>
  `; }).join('');

  let subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
let reduction = 0;

if (appliedPromo) {
  reduction = subtotal * (appliedPromo / 100);
}

const afterPromo = subtotal - reduction;
const shipping = computeShipping(afterPromo);
const total = afterPromo + shipping;

const oldShip = document.getElementById('cart-ship-line');
if (oldShip) oldShip.remove();
const shipLine = document.createElement('div');
shipLine.id = 'cart-ship-line';
shipLine.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:var(--text-light);';
shipLine.innerHTML = '<span>Livraison (France)</span><span>' + (shipping === 0 ? '<b style="color:#2e6b4f;">Offerte 🎉</b>' : shipping.toFixed(2) + ' €') + '</span>';
foot.querySelector('#promo-zone') ? foot.insertBefore(shipLine, foot.querySelector('#promo-zone')) : foot.insertBefore(shipLine, foot.firstChild);

document.getElementById('cart-total').textContent = total.toFixed(2) + ' €';
updateShipBanner();

const oldPromo = document.getElementById("promo-zone");
if (oldPromo) oldPromo.remove();

foot.insertAdjacentHTML("afterbegin", `
  <div id="promo-zone" style="margin-bottom:16px;">
    <input
      id="promo-code"
      type="text"
      placeholder="Code promo"
      style="width:100%;padding:12px 16px;border:1px solid var(--beige-mid);border-radius:12px;margin-bottom:8px;"
    >
    <button
      class="btn btn-soft"
      style="width:100%;justify-content:center;"
      onclick="applyPromoCode()"
    >
      🎁 Appliquer le code
    </button>
    ${
      promoMessage
        ? `<div style="margin-top:8px;font-size:12px;color:${appliedPromo ? 'green' : '#c8806a'};">${promoMessage}</div>`
        : ''
    }
  </div>
`);
}

function toggleCart() {
  document.getElementById('cart-panel').classList.toggle('active');
  document.getElementById('cart-overlay').classList.toggle('active');
  renderCartPanel();
}

// ══════════════════════════════════
//  DETAIL MODAL
// ══════════════════════════════════
function openDetail(productId) {
  const p = PRODUCTS.find(x => String(x.id) === String(productId));
if (p.outOfStock) return;
 const fabricSelect = p.custom && p.fabrics?.length ? `
  <div class="fabric-section">
    <div class="fabric-label">Choisir un ou plusieurs tissus</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
      ${p.fabrics.map(f => `
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-light);">
          <input type="checkbox" class="fabric-check-${p.id}" value="${f}">
          ${f}
        </label>
      `).join('')}
    </div>
  </div>
` : '';

  const photos = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
  const visual = photos.length ? `
    <div class="detail-gallery">
      <div class="detail-gallery-main">
        <img id="detail-main-img" src="${imgSrc(photos[0], 1000)}" alt="${p.name}" decoding="async" onerror="imgFail(this,'🖼️')">
      </div>
      ${photos.length > 1 ? `
      <div class="detail-thumbs">
        ${photos.map((ph, i) => `<img src="${imgSrc(ph, 200)}" data-full="${imgSrc(ph, 1000)}" class="${i === 0 ? 'active' : ''}" loading="lazy" decoding="async" onclick="setDetailImg(${i})" onerror="this.style.display='none'">`).join('')}
      </div>` : ''}
    </div>` : p.emoji;

  document.getElementById('detail-content').innerHTML = `
    <button class="close-btn" onclick="closeDetail()">✕</button>
    <div class="detail-img">${visual}</div>
    <div class="detail-info">
      <div class="product-cat">${p.cat}</div>
      <h2 class="product-name">${p.name}</h2>
      <div class="product-desc">${p.desc}</div>
      ${fabricSelect}
      <div class="product-price">${p.price} €</div>
      ${stockLabel(p)}
      <div class="product-actions">
        <button class="btn btn-primary" onclick="
          selectedFabrics['${p.id}'] = Array.from(document.querySelectorAll('.fabric-check-${p.id}:checked')).map(el => el.value);
          addToCart('${p.id}');
          closeDetail();
        ">🛒 Ajouter au panier</button>
        <a href="tel:0750483818" class="btn btn-soft">📞 Appeler</a>
      </div>
    </div>
  `;

  document.getElementById('detail-overlay').classList.add('active');
}

function selectFabricDetail(e, productId, fabricIdx) {
  e.stopPropagation();
  selectedFabrics[productId] = fabricIdx;
  openDetail(productId);
}

// Bascule l'image principale de la galerie détail
function setDetailImg(i) {
  const main = document.getElementById('detail-main-img');
  const thumbs = document.querySelectorAll('.detail-thumbs img');
  if (!main || !thumbs[i] || thumbs[i].style.display === 'none') return;
  main.src = thumbs[i].dataset.full || thumbs[i].src;
  thumbs.forEach((t, j) => t.classList.toggle('active', j === i));
}
function closeDetail() {


  document.getElementById('detail-overlay').classList.remove('active');
}

// ══════════════════════════════════
//  ORDER MODAL
// ══════════════════════════════════
function openOrder() {
  // summary
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const after = sub - (appliedPromo ? sub * (appliedPromo / 100) : 0);
  const shipping = computeShipping(after);
  const total = after + shipping;
  document.getElementById('order-summary').innerHTML = `
    <h4>Récapitulatif</h4>
    ${cart.map(i => `
      <div class="modal-order-item">
        <span>${i.emoji} ${i.name} ${i.fabric ? '('+i.fabric+')' : ''} ×${i.qty}</span>
        <span>${i.price * i.qty} €</span>
      </div>
    `).join('')}
    ${appliedPromo ? `<div class="modal-order-item"><span>Promo ${appliedPromoCode} (−${appliedPromo}%)</span><span>−${(sub * appliedPromo / 100).toFixed(2)} €</span></div>` : ''}
    <div class="modal-order-item"><span>Livraison (France)</span><span>${shipping === 0 ? 'Offerte 🎉' : shipping.toFixed(2) + ' €'}</span></div>
    <div class="modal-order-total"><span>Total TTC</span><span>${total.toFixed(2)} €</span></div>
  `;
  document.getElementById('order-overlay').classList.add('active');
  toggleCart();
  updateShipBanner();
}
const sendBtn = document.getElementById('send-order-btn');
if (sendBtn) {
  sendBtn.disabled = false;
  sendBtn.innerHTML = '💳 Payer par carte';
  sendBtn.style.opacity = '1';
  sendBtn.style.pointerEvents = 'auto';
}
function closeOrder() {
  document.getElementById('order-overlay').classList.remove('active');
}
function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;

  toast.style.background = isError
    ? "#c8806a"
    : "var(--navy)";

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}
// ══════════════════════════════════
//  LIVRAISON : DOMICILE OU POINT RELAIS
// ══════════════════════════════════
let selectedRelay = null; // { name, address, id }
let relayResults = []; // résultats de la dernière recherche Sendcloud
let relaySearchZip = '';
let relaySearchCp = '';

function getDeliveryMode() {
  const checked = document.querySelector('input[name="delivery-mode"]:checked');
  return checked ? checked.value : 'home';
}

function onDeliveryModeChange() {
  const mode = getDeliveryMode();
  document.getElementById('relay-block').style.display = mode === 'relay' ? 'block' : 'none';
  document.getElementById('home-block').style.display  = mode === 'relay' ? 'none' : 'block';
  if (mode !== 'relay') { selectedRelay = null; }
}

async function searchRelays() {
  const cp = (document.getElementById('relay-zip').value || '').replace(/\D/g, '').slice(0, 5);
  const box = document.getElementById('relay-results');
  if (cp.length !== 5) {
    box.innerHTML = '<div class="relay-note">Merci de saisir un code postal à 5 chiffres.</div>';
    return;
  }
  box.innerHTML = '<div class="relay-note">🔍 Recherche des points relais…</div>';
  relaySearchCp = cp;

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'searchRelays', zip: cp })
    });
    const data = await res.json();
    relayResults = (data && data.relays) || [];
    if (data && data.relays && data.relays.length) {
      box.innerHTML = '<div class="relay-list">' + data.relays.map((r, i) => `
        <label class="relay-item" data-i="${i}">
          <input type="radio" name="relay-pick" value="${i}" onchange="selectRelay(${i})" />
          <span class="relay-txt">
            <span class="relay-name">${escapeHtml(r.name)}</span>
            <span class="relay-addr">${escapeHtml(r.address)}</span>
          </span>
        </label>`).join('') + '</div>'
        + '<div class="relay-note">💡 Vous pourrez toujours préciser votre point relais préféré dans les remarques.</div>';
      return;
    }

    // Pas de config API ou aucun résultat → saisie libre
    box.innerHTML = '<div class="relay-note">Aucun point relais trouvé automatiquement pour ce code postal. '
      + 'Indiquez votre relais préféré ci-dessous (ou dans les remarques).</div>'
      + '<div class="relay-manual"><input id="relay-manual-input" placeholder="Ex : Relais du Marché, 12 rue de la Poste, 75011 Paris" '
      + 'oninput="selectManualRelay(this.value)" /></div>';

  } catch (e) {
    console.error('Recherche relais', e);
    box.innerHTML = '<div class="relay-note">Recherche indisponible. Indiquez votre relais préféré ci-dessous.</div>'
      + '<div class="relay-manual"><input id="relay-manual-input" placeholder="Point relais souhaité" '
      + 'oninput="selectManualRelay(this.value)" /></div>';
  }
}

function selectRelay(i) {
  const items = document.querySelectorAll('#relay-results .relay-item');
  if (!items[i]) return;
  items.forEach(el => el.classList.remove('selected'));
  items[i].classList.add('selected');
  const name = items[i].querySelector('.relay-name').textContent;
  const addr = items[i].querySelector('.relay-addr').textContent;
  selectedRelay = { name: name, address: addr, id: (relayResults[i] && relayResults[i].id) || '' };
  document.getElementById('order-relay-name').value = name;
  document.getElementById('order-relay-address').value = addr;
}

function selectManualRelay(v) {
  const val = (v || '').trim();
  if (!val) { selectedRelay = null; return; }
  selectedRelay = { name: 'Point relais (à confirmer)', address: val, id: '' };
  document.getElementById('order-relay-name').value = selectedRelay.name;
  document.getElementById('order-relay-address').value = val;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function orderFormData() {
  const mode = getDeliveryMode();
  const base = {
    name: document.getElementById('order-name').value.trim(),
    phone: document.getElementById('order-phone').value.trim(),
    email: document.getElementById('order-email').value.trim(),
    note: document.getElementById('order-note').value.trim(),
    deliveryMode: mode,
    relayName: mode === 'relay' && selectedRelay ? selectedRelay.name : '',
    relayAddress: mode === 'relay' && selectedRelay ? selectedRelay.address : '',
    relayId: mode === 'relay' && selectedRelay ? (selectedRelay.id || '') : '',
    relayZip: mode === 'relay' ? relaySearchCp : ''
  };
  if (mode === 'relay') {
    // L'adresse du relais remplace l'adresse postale
    base.address = base.relayAddress;
    base.zip = relaySearchCp;
    base.city = '';
  } else {
    base.address = document.getElementById('order-address').value.trim();
    base.zip = document.getElementById('order-zip').value.trim();
    base.city = document.getElementById('order-city').value.trim();
  }
  return base;
}
function setOrderBtn(disabled, label) {
  const sendBtn = document.getElementById('send-order-btn');
  if (!sendBtn) return;
  sendBtn.disabled = disabled;
  sendBtn.innerHTML = label;
  sendBtn.style.opacity = disabled ? '0.7' : '1';
  sendBtn.style.pointerEvents = disabled ? 'none' : 'auto';
}
async function payWithStripe() {
  const f = orderFormData();
  if (!f.name || !f.phone) {
    alert('Merci de renseigner votre nom et téléphone.');
    return;
  }
  if (f.deliveryMode === 'relay') {
    if (!f.relayName) {
      alert('Merci de choisir un point relais (bouton « Chercher ») ou d’indiquer votre relais préféré.');
      return;
    }
  } else if (!f.address || !f.zip || !f.city) {
    alert('Merci de renseigner votre adresse de livraison complète (adresse, code postal, ville).');
    return;
  }
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    alert('Merci de renseigner un email valide.');
    return;
  }
  setOrderBtn(true, '💳 Redirection sécurisée…');
  const sub = cartSubtotal();
  const after = sub - (appliedPromo ? sub * (appliedPromo / 100) : 0);
  const shipping = computeShipping(after);
  const siteUrl = window.location.origin + window.location.pathname;
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'createCheckout',
        ...f,
        promoCode: appliedPromoCode || '',
        promoReduction: appliedPromo || 0,
        shipping,
        items: cart.map(i => ({ id: i.id, name: i.name, fabric: i.fabric || '', qty: i.qty, unitPrice: i.price })),
        siteUrl
      })
    });
    const data = await res.json();
    if (data && data.url) {
      window.location.href = data.url;
      return;
    }
    setOrderBtn(false, '💳 Payer par carte');
    alert(data && data.message ? data.message : 'Le paiement n\'a pas pu être lancé. Réessayez.');
  } catch (e) {
    setOrderBtn(false, '💳 Payer par carte');
    console.error('Erreur paiement', e);
    alert('Erreur lors du lancement du paiement. Réessayez dans un instant.');
  }
}
function resetAfterOrder() {
  cart = [];
  updateCartUI();
  closeOrder();
  document.getElementById('order-overlay').classList.remove('active');
  // reset modal content for next time
  location.reload();
}

// ══════════════════════════════════
//  SCROLL REVEAL
// ══════════════════════════════════
function observeReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
}

// NAV scroll
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
});

// ══════════════════════════════════
//  LEGAL TOGGLES
// ══════════════════════════════════

// ══════════════════════════════════
//  LEGAL TOGGLES
// ══════════════════════════════════
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;

  const target = document.getElementById(btn.dataset.target);
  if (!target) return;

  const isOpen = target.style.maxHeight && target.style.maxHeight !== "0px";

  if (isOpen) {
    target.style.maxHeight = "0";
    target.style.opacity = "0";
    target.style.marginTop = "0";
  } else {
    target.style.maxHeight = target.scrollHeight + "px";
    target.style.opacity = "1";
    target.style.marginTop = "20px";
  }
});


// ══════════════════════════════════
//  HERO CANVAS — ANIMATION COUTURE
// ══════════════════════════════════
(function() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Fils de couture ondulants
  const THREAD_COUNT = 8;
  const threads = Array.from({length: THREAD_COUNT}, () => ({
    drawn   : Math.random(),
    speed   : 0.00035 + Math.random() * 0.0004,
    p0x: Math.random() * 0.3,
    p0y: 0.1 + Math.random() * 0.8,
    p1x: 0.2 + Math.random() * 0.3,
    p1y: Math.random(),
    p2x: 0.5 + Math.random() * 0.3,
    p2y: Math.random(),
    p3x: 0.7 + Math.random() * 0.3,
    p3y: 0.1 + Math.random() * 0.8,
    opacity : 0.07 + Math.random() * 0.10,
    width   : 0.8 + Math.random() * 1.0,
    color   : Math.random() > 0.4 ? 'beige' : 'navy',
    maxDraw : 0.55 + Math.random() * 0.45,
    tailLen : 0.15 + Math.random() * 0.15,
  }));

  // ── Points de couture (tirets dispersés)
  const dashes = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 20; c++) {
      if (Math.random() < 0.5) {
        dashes.push({
          xFrac  : (c + 0.5 + (Math.random()-0.5)*0.6) / 20,
          yFrac  : (r + 0.5 + (Math.random()-0.5)*0.8) / 6,
          angle  : Math.PI * (0.1 + Math.random() * 0.8),
          len    : 6 + Math.random() * 10,
          opacity: 0.045 + Math.random() * 0.055,
          navy   : Math.random() > 0.5,
        });
      }
    }
  }

  // ── Aiguilles
  function drawNeedle(x, y, angle, opacity, scale) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 14);
    ctx.strokeStyle = 'rgba(30,45,74,1)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -18, 1.5, 3.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(30,45,74,1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1, 11);
    ctx.quadraticCurveTo(0, 20, 1, 11);
    ctx.fillStyle = 'rgba(30,45,74,0.85)';
    ctx.fill();
    ctx.restore();
  }

  const NEEDLES = [
    { xf:0.07, yf:0.15, angle: 0.30, op:0.11, s:1.1 },
    { xf:0.90, yf:0.10, angle:-0.50, op:0.10, s:0.9 },
    { xf:0.93, yf:0.75, angle: 0.65, op:0.09, s:1.0 },
    { xf:0.12, yf:0.85, angle:-0.20, op:0.10, s:0.85},
    { xf:0.50, yf:0.05, angle: 0.10, op:0.07, s:0.75},
    { xf:0.50, yf:0.93, angle:-0.40, op:0.07, s:0.8 },
  ];

  // ── Bobines
  function drawBobbin(x, y, r, op) {
    for (let i = 0; i < 4; i++) {
      const ri = r - i * 4;
      if (ri <= 0) continue;
      ctx.beginPath();
      ctx.arc(x, y, ri, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(201,180,154,${op * (1 - i * 0.18)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(30,45,74,${op * 0.8})`;
    ctx.fill();
  }

  const BOBBINS = [
    {xf:0.04,yf:0.05,r:22,op:0.08},
    {xf:0.96,yf:0.94,r:18,op:0.07},
    {xf:0.97,yf:0.08,r:14,op:0.06},
    {xf:0.03,yf:0.92,r:16,op:0.06},
  ];

  function bezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
  }

  function drawThread(th, W, H) {
    const start = Math.max(0, th.drawn - th.tailLen);
    const end   = Math.min(th.drawn, 1);
    const steps = 80;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= steps; i++) {
      const t = start + (end - start) * (i / steps);
      const x = bezier(t, th.p0x, th.p1x, th.p2x, th.p3x) * W;
      const y = bezier(t, th.p0y, th.p1y, th.p2y, th.p3y) * H;
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    const tailFrac = Math.min(1, th.drawn / th.tailLen);
    const alpha = th.opacity * tailFrac;
    ctx.strokeStyle = th.color === 'beige'
      ? `rgba(201,180,154,${alpha})`
      : `rgba(30,45,74,${alpha * 0.65})`;
    ctx.lineWidth = th.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  let last = 0;
  function animate(ts) {
    const dt = Math.min(ts - last, 50);
    last = ts;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Dégradé de fond doux
    const grad = ctx.createRadialGradient(W*0.5, 0, 0, W*0.5, H*0.5, W*0.75);
    grad.addColorStop(0, 'rgba(201,180,154,0.18)');
    grad.addColorStop(1, 'rgba(248,243,237,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Points de couture
    dashes.forEach(d => {
      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.translate(d.xFrac * W, d.yFrac * H);
      ctx.rotate(d.angle);
      ctx.beginPath();
      ctx.moveTo(-d.len/2, 0);
      ctx.lineTo(d.len/2, 0);
      ctx.strokeStyle = d.navy ? 'rgba(30,45,74,1)' : 'rgba(201,180,154,1)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    });

    // Bobines
    BOBBINS.forEach(b => drawBobbin(b.xf*W, b.yf*H, b.r, b.op));

    // Fils animés
    threads.forEach(th => {
      th.drawn += th.speed * dt;
      if (th.drawn > th.maxDraw + th.tailLen) {
        th.drawn = 0;
        th.p0x = Math.random() * 0.3;
        th.p0y = 0.1 + Math.random() * 0.8;
        th.p1x = 0.2 + Math.random() * 0.3;
        th.p1y = Math.random();
        th.p2x = 0.5 + Math.random() * 0.3;
        th.p2y = Math.random();
        th.p3x = 0.7 + Math.random() * 0.3;
        th.p3y = 0.1 + Math.random() * 0.8;
        th.maxDraw = 0.55 + Math.random() * 0.45;
        th.opacity = 0.07 + Math.random() * 0.10;
        th.color = Math.random() > 0.4 ? 'beige' : 'navy';
      }
      drawThread(th, W, H);
    });

    // Aiguilles
    NEEDLES.forEach(n => drawNeedle(n.xf*W, n.yf*H, n.angle, n.op, n.s));

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
function openSpecialRequest() {
  document.getElementById('special-overlay').classList.add('active');
const sendBtn = document.getElementById('send-special-btn');
if (sendBtn) {
  sendBtn.disabled = false;
  sendBtn.innerHTML = 'Envoyer ✉️';
  sendBtn.style.opacity = '1';
  sendBtn.style.pointerEvents = 'auto';
}
}

function closeSpecialRequest() {
  document.getElementById('special-overlay').classList.remove('active');
}

async function sendSpecialRequest() {
  const name = document.getElementById('special-name').value.trim();
  const phone = document.getElementById('special-phone').value.trim();
  const email = document.getElementById('special-email').value.trim();
  const message = document.getElementById('special-message').value.trim();
  const requestedDate = document.getElementById('special-date')?.value || '';
  const budget = document.getElementById('special-budget')?.value.trim() || '';
  const file = document.getElementById('special-file')?.files?.[0];

  if (!name || !phone || !email || !message) {
    alert("Merci de remplir tous les champs.");
    return;
  }

  const sendBtn = document.getElementById('send-special-btn');
  if (sendBtn.disabled) return;

  sendBtn.disabled = true;
  sendBtn.innerHTML = '💌 Envoi...';
  sendBtn.style.opacity = '0.7';
  sendBtn.style.pointerEvents = 'none';

  let fileBase64 = "";
  let fileName = "";

  if (file) {
    fileName = file.name;
    fileBase64 = await toBase64(file);
  }

  fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "specialRequest",
      name,
      phone,
      email,
      message,
      requestedDate,
      budget,
      fileName,
      fileBase64
    })
  }).catch((e) => {
    console.error(e);
    showToast("⚠️ Petit souci lors de l'envoi", true);
  });

  document.getElementById('special-request-modal-content').innerHTML = `
    <div class="success-state">
      <div class="success-icon">✂️</div>
      <h3>Demande envoyée !</h3>
      <p>
        Merci <strong>${name}</strong> 💛<br><br>
        Votre demande spéciale a bien été transmise à Douce Grâce.<br>
        Elle reviendra vers vous au <strong>${phone}</strong> ou par email
        pour échanger sur votre projet.
      </p>
      <br>
      <button class="btn btn-primary" onclick="closeSpecialRequest()" style="margin:0 auto;">
        Continuer →
      </button>
    </div>
  `;
}


function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}
