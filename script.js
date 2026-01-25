let products = [];
let cart = JSON.parse(localStorage.getItem('nittofy-cart')) || [];

// --- 1. DATA LOADING ---
async function loadProducts() {
    try {
        const response = await fetch('products.json');
        products = await response.json();
        renderProducts(products);
        updateCartUI();
    } catch (error) {
        console.error("Error loading products:", error);
    }
}

// --- 2. RENDER LOGIC ---
function renderProducts(list) {
    const container = document.getElementById('product-list');
    container.innerHTML = '';
    list.forEach(product => {
        const discount = Math.round(((product.old_price - product.price) / product.old_price) * 100);
        container.innerHTML += `
            <div class="product-card">
                <span class="badge">-${discount}%</span>
                <img src="${product.image}" alt="${product.name}">
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <div class="prices">
                        <span class="price">৳${product.price}</span>
                        <span class="old-price">৳${product.old_price}</span>
                    </div>
                    <button class="add-btn" onclick="addToCart(${product.id})">Add to Cart</button>
                </div>
            </div>`;
    });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const text = e.target.value.toLowerCase();
    const filtered = products.filter(p => p.name.toLowerCase().includes(text));
    renderProducts(filtered);
});

// --- 3. CART LOGIC ---
function addToCart(id) {
    const product = products.find(p => p.id === id);
    const item = cart.find(i => i.id === id);
    if (item) item.qty++;
    else cart.push({ ...product, qty: 1 });
    saveAndUpdate();
    toggleCart(true);
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveAndUpdate();
    if (!document.getElementById('checkout-view').classList.contains('hidden')) {
        renderCheckoutSummary();
    }
}

function saveAndUpdate() {
    localStorage.setItem('nittofy-cart', JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cartItems');
    const countSpan = document.getElementById('cartCount');
    const totalSpan = document.getElementById('cartTotal');
    
    container.innerHTML = '';
    let total = 0, count = 0;

    if (cart.length === 0) container.innerHTML = '<p class="empty-msg">Cart is empty</p>';

    cart.forEach(item => {
        total += item.price * item.qty;
        count += item.qty;
        container.innerHTML += `
            <div class="cart-item">
                <img src="${item.image}">
                <div class="item-details">
                    <h4>${item.name}</h4>
                    <p>৳${item.price} x ${item.qty}</p>
                    <span class="remove-btn" onclick="removeFromCart(${item.id})">Remove</span>
                </div>
            </div>`;
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

// --- 4. NAVIGATION ---
function goToCheckout() {
    if (cart.length === 0) return alert("Your cart is empty!");
    toggleCart(false);
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('searchContainer').classList.add('hidden');
    document.getElementById('checkout-view').classList.remove('hidden');
    renderCheckoutSummary();
    window.scrollTo(0, 0);
}

function showHome() {
    document.getElementById('checkout-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('searchContainer').classList.remove('hidden');
}

function renderCheckoutSummary() {
    const container = document.getElementById('checkout-items');
    const totalSpan = document.getElementById('checkout-total');
    let total = 0;
    container.innerHTML = '';
    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        container.innerHTML += `
            <div class="checkout-item">
                <span>${item.name} <strong style="color:#333">x ${item.qty}</strong></span>
                <span>৳${itemTotal}</span>
            </div>`;
    });
    totalSpan.innerText = '৳' + total;
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

// --- 5. ORDER & GOOGLE SHEETS INTEGRATION ---

function placeOrder() {
    // 1. Get Values
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const address = document.getElementById('c-address').value.trim();
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const trxId = document.getElementById('c-trxid').value.trim();

    // 2. Validation
    if (!name || !phone || !address) {
        return alert("Please fill in Name, Phone, and Address.");
    }
    if (paymentMethod === 'bkash' && !trxId) {
        return alert("Please enter your bKash Transaction ID.");
    }

    // 3. UI: Show Loading State
    const btn = document.querySelector('.place-order-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    // 4. Generate Order Data
    const orderId = crypto.randomUUID().toUpperCase();
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    // Create a string of products for the Google Sheet
    let productString = cart.map(item => `${item.name} (x${item.qty})`).join(", ");

    // 5. Send to Google Sheets
    // Your provided URL
    const scriptURL = 'https://script.google.com/macros/s/AKfycbx5QAIXyKEwIcF0RasWTdmpJSjtn9VmHluwOhJpqbyVyP6WXW2WGAdJLO8LqBwSBGA71w/exec';

    const formData = {
        order_id: orderId,
        name: name,
        phone: phone,
        address: address,
        products: productString,
        amount: totalAmount,
        payment: paymentMethod,
        trxid: trxId || "N/A"
    };

    fetch(scriptURL, {
        method: 'POST',
        mode: 'no-cors', // Essential for Google Apps Script interaction
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        // 6. Success: Open WhatsApp
        sendToWhatsApp(orderId, name, phone, email, address, paymentMethod, trxId, totalAmount);
        
        // Reset Button
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        // Optional: Clear Cart logic here if you want
        // localStorage.removeItem('nittofy-cart');
        // cart = [];
        // updateCartUI();
        // showHome();
    })
    .catch(error => {
        // 7. Error: Log it, but still open WhatsApp so you don't lose the sale
        console.error('Error!', error.message);
        alert("Network error. Opening WhatsApp directly.");
        sendToWhatsApp(orderId, name, phone, email, address, paymentMethod, trxId, totalAmount);
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

function sendToWhatsApp(orderId, name, phone, email, address, paymentMethod, trxId, totalAmount) {
    let msg = `Hello, I want to place an order.%0A%0A`;
    msg += `Order ID: ${orderId}%0A%0A`;
    msg += `Products:%0A`;
    
    cart.forEach(item => {
        msg += `- ${item.name} × ${item.qty}%0A`;
    });

    msg += `%0A*Total Price: ৳${totalAmount}*%0A%0A`;
    msg += `Customer Details:%0A`;
    msg += `Name: ${name}%0A`;
    msg += `Phone: ${phone}%0A`;
    msg += `Email: ${email || "N/A"}%0A`;
    msg += `Address: ${address}%0A%0A`;
    msg += `Payment Method: ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'bKash'}%0A`;

    if (paymentMethod === 'bkash') {
        msg += `bKash TrxID: ${trxId}%0A`;
    }

    const whatsappNumber = "8801897436108"; 
    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank');
}

// Start App
loadProducts();