export const users = [
  {
    id: "u-100",
    username: "exampleuser",
    password: "examplepassword",
    displayName: "Jamie Shopper",
    role: "customer",
    email: "exampleuser@example.test",
    apiKey: "shopper-api-key-7f2d",
    loyaltyTier: "Gold",
    defaultAddress: "100 Market Street, Springfield",
    notes: "Prefers delivery after 5pm."
  },
  {
    id: "u-200",
    username: "rivercustomer",
    password: "riverpassword",
    displayName: "River Customer",
    role: "customer",
    email: "river@example.test",
    apiKey: "river-private-api-key-91ab",
    loyaltyTier: "Platinum",
    defaultAddress: "42 River Road, Shelbyville",
    notes: "Saved payment: Visa ending 4242"
  },
  {
    id: "u-900",
    username: "storeadmin",
    password: "adminpassword",
    displayName: "Store Admin",
    role: "admin",
    email: "admin@example.test",
    apiKey: "admin-root-api-key-cafe",
    loyaltyTier: "Staff",
    defaultAddress: "Warehouse Office",
    notes: "Administrative account."
  }
];

export const products = [
  { id: "p-101", name: "Trail Runner Backpack", price: "$89.00", badge: "Best seller" },
  { id: "p-102", name: "Insulated Coffee Tumbler", price: "$24.00", badge: "New" },
  { id: "p-103", name: "Merino Travel Hoodie", price: "$139.00", badge: "Limited" }
];

export const orders = [
  { id: "ord-1001", ownerId: "u-100", total: "$113.00", status: "Shipped", items: ["Trail Runner Backpack", "Coffee Tumbler"], shippingAddress: "100 Market Street, Springfield", paymentMemo: "Visa ending 1111" },
  { id: "ord-2001", ownerId: "u-200", total: "$4,800.00", status: "Processing", items: ["Corporate gift cards"], shippingAddress: "42 River Road, Shelbyville", paymentMemo: "Corporate card 4242, approval code RIVER-SECRET" }
];

export function findUserByUsername(username) {
  return users.find((user) => user.username === username);
}

export function findUserById(id) {
  return users.find((user) => user.id === id);
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    loyaltyTier: user.loyaltyTier,
    defaultAddress: user.defaultAddress
  };
}
