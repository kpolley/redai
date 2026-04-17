let token = localStorage.getItem("shopnorth_token") || "";
let currentUser;

const $ = (id) => document.getElementById(id);

init();

function init() {
  $("login-form").onsubmit = login;
  $("logout").onclick = logout;
  $("refresh-account").onclick = loadAccount;
  $("return-form").onsubmit = createReturn;
  $("load-admin").onclick = loadAdminDirectory;
  renderSession();
  loadProducts();
  if (token) loadAccount();
}

async function login(event) {
  event.preventDefault();
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: $("username").value, password: $("password").value })
  });
  const data = await response.json();
  if (!response.ok) {
    $("login-message").textContent = data.error || "Sign in failed";
    return;
  }
  token = data.token;
  currentUser = data.user;
  localStorage.setItem("shopnorth_token", token);
  $("login-message").textContent = "";
  renderSession();
  await loadAccount();
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  token = "";
  currentUser = undefined;
  localStorage.removeItem("shopnorth_token");
  renderSession();
}

async function loadAccount() {
  const response = await fetch("/api/me", authOptions());
  if (!response.ok) return logout();
  const data = await response.json();
  currentUser = data.user;
  renderSession();
  renderOrders();
}

async function loadProducts() {
  const response = await fetch("/api/products");
  const products = await response.json();
  $("product-list").innerHTML = products.map((product) => `
    <article class="product-card">
      <span>${product.badge}</span>
      <div class="product-art">${product.name.split(" ").map((word) => word[0]).join("").slice(0, 3)}</div>
      <h3>${product.name}</h3>
      <p>${product.price}</p>
      <button>Add to cart</button>
    </article>
  `).join("");
}

function renderOrders() {
  const orders = [
    { id: "ord-1001", title: "Trail Runner Backpack + Coffee Tumbler", status: "Shipped", total: "$113.00" }
  ];
  $("orders-list").innerHTML = orders.map((order) => `
    <article class="order-card">
      <div><strong>${order.id}</strong><p>${order.title}</p></div>
      <div><span>${order.status}</span><strong>${order.total}</strong></div>
    </article>
  `).join("");
}

async function createReturn(event) {
  event.preventDefault();
  const orderId = $("return-order").value;
  const reason = $("return-reason").value;
  const notes = $("return-notes").value;
  const response = await fetch("/api/returns/export", {
    method: "POST",
    ...authOptions(),
    headers: { ...authOptions().headers, "content-type": "application/json" },
    body: JSON.stringify({ filename: `returns/${orderId}-label.txt`, content: `${reason}: ${notes}` })
  });
  $("return-message").textContent = response.ok ? "Return label created. Check your downloads shortly." : "Could not create return label.";
}

async function loadAdminDirectory() {
  const response = await fetch("/api/admin/users", authOptions());
  const data = await response.json();
  if (!response.ok) {
    $("admin-list").innerHTML = `<p class="message">${data.error}</p>`;
    return;
  }
  $("admin-list").innerHTML = data.map((user) => `
    <article class="order-card"><div><strong>${user.displayName}</strong><p>${user.email}</p></div><span>${user.role}</span></article>
  `).join("");
}

function authOptions() {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function renderSession() {
  const signedIn = Boolean(token);
  $("login-view").classList.toggle("hidden", signedIn);
  $("app-view").classList.toggle("hidden", !signedIn);
  $("logout").classList.toggle("hidden", !signedIn);
  $("admin-link").classList.toggle("hidden", !signedIn);
  $("admin").classList.toggle("hidden", !signedIn);
  $("session-label").textContent = currentUser ? `${currentUser.displayName} · ${currentUser.loyaltyTier}` : signedIn ? "Signed in" : "Guest";
  if (currentUser) {
    $("welcome-title").textContent = `Welcome back, ${currentUser.displayName.split(" ")[0]}`;
    $("shipping-address").textContent = currentUser.defaultAddress;
    $("loyalty-tier").textContent = `${currentUser.loyaltyTier} member`;
  }
}
