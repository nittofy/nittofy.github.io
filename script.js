// ============================================================
//  CONFIG — all magic values in one place
// ============================================================
const CONFIG = {
    whatsappNumber: '8801897436108',
    bkashNumber:    '01897436108',
    googleScriptURL:'https://script.google.com/macros/s/AKfycbx5QAIXyKEwIcF0RasWTdmpJSjtn9VmHluwOhJpqbyVyP6WXW2WGAdJLO8LqBwSBGA71w/exec',
    cartKey:        'nittofy-cart',
    phoneRegex:     /^01[3-9]\d{8}$/,   // valid Bangladeshi mobile numbers
};

// ============================================================
//  STATE
// ============================================================
let products = [];
let cart     = loadCart();

// ============================================================
//  UTILITIES
// ============================================================

/** Safely escape text to prevent XSS when building HTML strings */
function esc(str) {
    const el = document.createElement('div');
    el.textContent = String(str);
    return el.innerHTML;
}

/** Load cart from localStorage with shape validation */
function loadCart() {
    try {
        const raw = localStorage.getItem(CONFIG.cartKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Validate each item — reject anything that doesn't look right
        return parsed.filter(item =>
            typeof item.id    === 'number' &&
            typeof item.name  === 'string' &&
            typeof item.price === 'number' &&
            typeof item.qty   === 'number' &&
            item.qty > 0
        );
    } catch {
        return [];
    }
}

/** Show a toast message (replaces all alert() calls) */
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/** Sanitise a plain-text user input — strip HTML, trim, collapse spaces */
function sanitise(str) {
    return str.replace(/<[^>]*>/g, '').trim().replace(/\s{2,}/g, ' ');
}

// ============================================================
//  1. DATA LOADING
// ============================================================
async function loadProducts() {
    try {
        // Cache-bust: timestamp param forces CDN to always return the latest file
        const url = `products.json?v=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Network response was not ok');
        const raw = await response.json();

        // Validate product shape before using (description & features are optional)
        products = raw.filter(p =>
            typeof p.id        === 'number' &&
            typeof p.name      === 'string' &&
            typeof p.price     === 'number' &&
            typeof p.old_price === 'number' &&
            typeof p.image     === 'string'
        );

        renderProducts(products);
        updateCartUI();
    } catch (error) {
        console.error('Error loading products:', error);
        const container = document.getElementById('product-list');
        container.innerHTML = '';
        const msg = document.createElement('p');
        msg.className = 'empty-msg';
        msg.textContent = 'Could not load products. Please refresh the page.';
        container.appendChild(msg);
    }
}

// ============================================================
//  2. RENDER LOGIC  (safe — no innerHTML with user/external data)
// ============================================================
function renderProducts(list) {
    const container = document.getElementById('product-list');
    container.innerHTML = '';

    if (list.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'empty-msg full-width';
        msg.textContent = 'No products found. Try a different search term.';
        container.appendChild(msg);
        return;
    }

    list.forEach(product => {
        const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);

        // Build card using DOM — never concatenate untrusted strings into innerHTML
        const card = document.createElement('div');
        card.className = 'product-card';

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `-${discount}%`;

        const img = document.createElement('img');
        img.src   = product.image;
        img.alt   = product.name;
        img.loading = 'lazy';
        img.onerror = () => { img.src = 'images/placeholder.jpg'; };

        const info = document.createElement('div');
        info.className = 'product-info';

        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = product.name;   // textContent — XSS-safe

        const prices = document.createElement('div');
        prices.className = 'prices';

        const price = document.createElement('span');
        price.className = 'price';
        price.textContent = `৳${product.price}`;

        const oldPrice = document.createElement('span');
        oldPrice.className = 'old-price';
        oldPrice.textContent = `৳${product.old_price}`;

        prices.appendChild(price);
        prices.appendChild(oldPrice);

        const btn = document.createElement('button');
        btn.className = 'add-btn';
        btn.textContent = 'Add to Cart';
        // Stop propagation so clicking button doesn't also open detail view
        btn.addEventListener('click', (e) => { e.stopPropagation(); addToCart(product.id); });

        const hint = document.createElement('p');
        hint.className = 'view-hint';
        hint.textContent = '👆 Tap card for details';

        info.appendChild(title);
        info.appendChild(prices);
        info.appendChild(btn);
        info.appendChild(hint);

        card.appendChild(badge);
        card.appendChild(img);
        card.appendChild(info);

        // Entire card opens product detail (except the Add to Cart button)
        card.addEventListener('click', () => showDetail(product.id));

        container.appendChild(card);
    });
}

// Search — desktop
document.getElementById('searchInput').addEventListener('input', handleSearch);

// Search — mobile
document.getElementById('mobileSearchInput').addEventListener('input', handleSearch);

function handleSearch(e) {
    const text = sanitise(e.target.value).toLowerCase();
    // Keep both inputs in sync
    document.getElementById('searchInput').value        = e.target.value;
    document.getElementById('mobileSearchInput').value  = e.target.value;
    const filtered = products.filter(p => p.name.toLowerCase().includes(text));
    renderProducts(filtered);
}

function toggleMobileSearch() {
    const bar = document.getElementById('mobileSearchContainer');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
        document.getElementById('mobileSearchInput').focus();
    }
}

// ============================================================
//  3. CART LOGIC
// ============================================================
function addToCart(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const item = cart.find(i => i.id === id);
    if (item) {
        item.qty++;
    } else {
        // Only store the fields we need — never store raw external objects wholesale
        cart.push({
            id:    product.id,
            name:  product.name,
            price: product.price,
            image: product.image,
            qty:   1,
        });
    }
    saveAndUpdate();
    toggleCart(true);
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
    }
    saveAndUpdate();
    if (!document.getElementById('checkout-view').classList.contains('hidden')) {
        renderCheckoutSummary();
    }
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveAndUpdate();
    if (!document.getElementById('checkout-view').classList.contains('hidden')) {
        renderCheckoutSummary();
    }
}

function saveAndUpdate() {
    localStorage.setItem(CONFIG.cartKey, JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cartItems');
    const countSpan = document.getElementById('cartCount');
    const totalSpan = document.getElementById('cartTotal');

    container.innerHTML = '';
    let total = 0, count = 0;

    if (cart.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'empty-msg';
        msg.textContent = 'Cart is empty';
        container.appendChild(msg);
    }

    cart.forEach(item => {
        total += item.price * item.qty;
        count += item.qty;

        // Build cart item with DOM — safe from XSS
        const row = document.createElement('div');
        row.className = 'cart-item';

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;

        const details = document.createElement('div');
        details.className = 'item-details';

        const h4 = document.createElement('h4');
        h4.textContent = item.name;

        const p = document.createElement('p');
        p.textContent = `৳${item.price}`;

        // Qty controls
        const qtyRow = document.createElement('div');
        qtyRow.className = 'qty-row';

        const minus = document.createElement('button');
        minus.className = 'qty-btn';
        minus.textContent = '−';
        minus.setAttribute('aria-label', 'Decrease quantity');
        minus.addEventListener('click', () => changeQty(item.id, -1));

        const qtyLabel = document.createElement('span');
        qtyLabel.className = 'qty-label';
        qtyLabel.textContent = item.qty;

        const plus = document.createElement('button');
        plus.className = 'qty-btn';
        plus.textContent = '+';
        plus.setAttribute('aria-label', 'Increase quantity');
        plus.addEventListener('click', () => changeQty(item.id, 1));

        const remove = document.createElement('span');
        remove.className = 'remove-btn';
        remove.textContent = 'Remove';
        remove.setAttribute('role', 'button');
        remove.setAttribute('tabindex', '0');
        remove.addEventListener('click', () => removeFromCart(item.id));

        qtyRow.appendChild(minus);
        qtyRow.appendChild(qtyLabel);
        qtyRow.appendChild(plus);
        qtyRow.appendChild(remove);

        details.appendChild(h4);
        details.appendChild(p);
        details.appendChild(qtyRow);

        row.appendChild(img);
        row.appendChild(details);
        container.appendChild(row);
    });

    countSpan.textContent = count;
    totalSpan.textContent = '৳' + total;
}

function toggleCart(forceOpen) {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (forceOpen === true) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    } else {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

// ============================================================
//  4. NAVIGATION
// ============================================================
function goToCheckout() {
    if (cart.length === 0) return showToast('Your cart is empty!', 'warn');
    toggleCart(false);
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('searchContainer').classList.add('hidden');
    document.getElementById('confirm-view').classList.add('hidden');
    document.getElementById('checkout-view').classList.remove('hidden');
    renderCheckoutSummary();
    window.scrollTo(0, 0);
}

function showHome() {
    document.getElementById('checkout-view').classList.add('hidden');
    document.getElementById('confirm-view').classList.add('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('searchContainer').classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ============================================================
//  PRODUCT DETAIL VIEW
// ============================================================
function showDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Safety: if detail-view element missing from HTML, do nothing silently
    if (!document.getElementById('detail-view')) {
        console.error('detail-view element not found in index.html — re-upload the latest index.html');
        return;
    }

    // Populate image
    const img = document.getElementById('detail-img');
    img.src = p.image;
    img.alt = p.name;
    img.onerror = () => { img.src = 'images/placeholder.jpg'; };

    // Badge
    const discount = Math.round(((p.old_price - p.price) / p.old_price) * 100);
    const badge = document.getElementById('detail-badge');
    if (discount > 0) {
        badge.textContent = `-${discount}%`;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    // Name & prices
    document.getElementById('detail-title').textContent    = p.name;
    document.getElementById('detail-price').textContent    = `৳${p.price.toLocaleString()}`;
    document.getElementById('detail-old-price').textContent = `৳${p.old_price.toLocaleString()}`;
    const saving = p.old_price - p.price;
    document.getElementById('detail-saving').textContent   = saving > 0 ? `Save ৳${saving.toLocaleString()}` : '';

    // Description
    const descWrap = document.getElementById('detail-desc-wrap');
    const descEl   = document.getElementById('detail-desc');
    if (p.description && p.description.trim()) {
        descEl.textContent = p.description;
        descWrap.style.display = 'block';
    } else {
        descWrap.style.display = 'none';
    }

    // Features
    const featWrap = document.getElementById('detail-features-wrap');
    const featList = document.getElementById('detail-features');
    featList.innerHTML = '';
    if (p.features && Array.isArray(p.features) && p.features.length > 0) {
        p.features.forEach(f => {
            const li = document.createElement('li');
            li.textContent = f;
            featList.appendChild(li);
        });
        featWrap.style.display = 'block';
    } else {
        featWrap.style.display = 'none';
    }

    // Add to cart button
    const addBtn = document.getElementById('detail-add-btn');
    addBtn.onclick = () => { addToCart(p.id); };

    // Back button — go back to wherever user came from
    const backBtn = document.getElementById('detail-back-btn');
    backBtn.onclick = () => showHome();

    // Show/hide views
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('checkout-view').classList.add('hidden');
    document.getElementById('confirm-view').classList.add('hidden');
    document.getElementById('searchContainer').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function showConfirmation(orderId, phone, whatsappURL) {
    document.getElementById('checkout-view').classList.add('hidden');
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('confirm-order-id').textContent = orderId;
    document.getElementById('confirm-phone').textContent    = phone;
    // Store URL on the WhatsApp button — triggered by direct user tap, never blocked
    const waBtn = document.getElementById('confirm-wa-btn');
    waBtn.href = whatsappURL;
    document.getElementById('confirm-view').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function renderCheckoutSummary() {
    const container = document.getElementById('checkout-items');
    const totalSpan = document.getElementById('checkout-total');
    let total = 0;
    container.innerHTML = '';

    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;

        const row = document.createElement('div');
        row.className = 'checkout-item';

        const left = document.createElement('span');
        const strong = document.createElement('strong');
        strong.style.color = '#333';
        strong.textContent = ` x ${item.qty}`;
        left.textContent = item.name;
        left.appendChild(strong);

        const right = document.createElement('span');
        right.textContent = `৳${itemTotal}`;

        row.appendChild(left);
        row.appendChild(right);
        container.appendChild(row);
    });

    totalSpan.textContent = '৳' + total;
}

function selectPayment(method, element) {
    const bkashField = document.getElementById('bkash-field');
    document.querySelectorAll('.payment-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    element.querySelector('input').checked = true;
    if (method === 'bkash') {
        bkashField.classList.remove('hidden');
    } else {
        bkashField.classList.add('hidden');
    }
}

// ============================================================
//  5. ORDER & GOOGLE SHEETS INTEGRATION
// ============================================================
function placeOrder() {
    // --- Get & sanitise values ---
    const name    = sanitise(document.getElementById('c-name').value);
    const phone   = sanitise(document.getElementById('c-phone').value);
    const email   = sanitise(document.getElementById('c-email').value);
    const address = sanitise(document.getElementById('c-address').value);
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const trxId   = sanitise(document.getElementById('c-trxid').value);

    // --- Validation ---
    if (!name) return showToast('Please enter your full name.', 'warn');
    if (!phone) return showToast('Please enter your phone number.', 'warn');
    if (!CONFIG.phoneRegex.test(phone)) {
        document.getElementById('phone-hint').textContent = 'Enter a valid Bangladeshi number (e.g. 01XXXXXXXXX)';
        return showToast('Please enter a valid phone number.', 'warn');
    }
    document.getElementById('phone-hint').textContent = '';
    if (!address) return showToast('Please enter your delivery address.', 'warn');
    if (paymentMethod === 'bkash' && !trxId) {
        return showToast('Please enter your bKash Transaction ID.', 'warn');
    }

    // --- Loading state ---
    const btn = document.getElementById('placeOrderBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    btn.disabled  = true;

    // --- Build order data ---
    const orderId     = crypto.randomUUID().toUpperCase().slice(0, 13); // shorter, friendlier ID
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const productString = cart.map(item => `${item.name} (x${item.qty})`).join(', ');

    const formData = {
        order_id: orderId,
        name,
        phone,
        address,
        products: productString,
        amount:   totalAmount,
        payment:  paymentMethod,
        trxid:    trxId || 'N/A',
    };

    // Build WhatsApp URL NOW while cart is still intact (cart gets cleared in afterOrderSuccess)
    const cartSnapshot = [...cart];
    const whatsappURL  = buildWhatsAppURL(orderId, name, phone, email, address, paymentMethod, trxId, totalAmount, cartSnapshot);

    // --- Send to Google Sheets ---
    fetch(CONFIG.googleScriptURL, {
        method:  'POST',
        mode:    'no-cors', // required for Google Apps Script
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(formData),
    })
    .then(() => {
        afterOrderSuccess(orderId, phone, btn, whatsappURL);
    })
    .catch(error => {
        console.error('Sheet error:', error.message);
        afterOrderSuccess(orderId, phone, btn, whatsappURL);
    });
}

function afterOrderSuccess(orderId, phone, btn, whatsappURL) {
    btn.innerHTML = 'Place Order <i class="fa-brands fa-whatsapp"></i>';
    btn.disabled  = false;
    // Clear cart after order
    cart = [];
    saveAndUpdate();
    // Show confirmation page with WhatsApp URL ready for manual tap
    showConfirmation(orderId, phone, whatsappURL);
}

function buildWhatsAppURL(orderId, name, phone, email, address, paymentMethod, trxId, totalAmount, cartSnapshot) {
    // Takes a cart snapshot so we can call this BEFORE cart is cleared
    let msg = `Hello, I want to place an order.%0A%0A`;
    msg    += `Order ID: ${orderId}%0A%0A`;
    msg    += `Products:%0A`;

    cartSnapshot.forEach(item => {
        msg += `- ${encodeURIComponent(item.name)} %C3%97 ${item.qty}%0A`;
    });

    msg += `%0A*Total Price: %E2%9D%B3${totalAmount}*%0A%0A`;
    msg += `Customer Details:%0A`;
    msg += `Name: ${encodeURIComponent(name)}%0A`;
    msg += `Phone: ${encodeURIComponent(phone)}%0A`;
    msg += `Email: ${email ? encodeURIComponent(email) : 'N/A'}%0A`;
    msg += `Address: ${encodeURIComponent(address)}%0A%0A`;
    msg += `Payment Method: ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'bKash'}%0A`;

    if (paymentMethod === 'bkash') {
        msg += `bKash TrxID: ${encodeURIComponent(trxId)}%0A`;
    }

    return `https://wa.me/${CONFIG.whatsappNumber}?text=${msg}`;
}

// ============================================================
//  START
// ============================================================
loadProducts();