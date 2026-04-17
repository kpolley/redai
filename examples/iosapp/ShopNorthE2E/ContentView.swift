import SwiftUI

struct User: Identifiable {
    let id: String
    let username: String
    let displayName: String
    let role: String
    let email: String
    let apiKey: String
    let address: String
    let paymentMemo: String
}

struct Order: Identifiable {
    let id: String
    let ownerId: String
    let total: String
    let status: String
    let items: String
    let shippingAddress: String
    let paymentMemo: String
}

let demoUsers = [
    User(id: "u-100", username: "exampleuser", displayName: "Jamie Shopper", role: "customer", email: "exampleuser@example.test", apiKey: "shopnorth-user-api-key-7f2d", address: "100 Market Street, Springfield", paymentMemo: "Visa ending 1111"),
    User(id: "u-200", username: "rivercustomer", displayName: "River Customer", role: "customer", email: "river@example.test", apiKey: "river-private-api-key-91ab", address: "42 River Road, Shelbyville", paymentMemo: "Corporate card 4242, approval RIVER-SECRET"),
    User(id: "u-900", username: "storeadmin", displayName: "Store Admin", role: "admin", email: "admin@example.test", apiKey: "admin-root-api-key-cafe", address: "Warehouse Office", paymentMemo: "Staff account")
]

let demoOrders = [
    Order(id: "ord-1001", ownerId: "u-100", total: "$113.00", status: "Shipped", items: "Trail Runner Backpack, Coffee Tumbler", shippingAddress: "100 Market Street, Springfield", paymentMemo: "Visa ending 1111"),
    Order(id: "ord-2001", ownerId: "u-200", total: "$4,800.00", status: "Processing", items: "Corporate gift cards", shippingAddress: "42 River Road, Shelbyville", paymentMemo: "Corporate card 4242, approval RIVER-SECRET")
]

struct ContentView: View {
    @AppStorage("sessionToken") private var sessionToken = ""
    @AppStorage("sessionUserId") private var sessionUserId = ""
    @State private var username = "exampleuser"
    @State private var password = "examplepassword"
    @State private var message = ""
    @State private var selectedOrder = demoOrders[0]
    @State private var selectedCustomer = demoUsers[0]
    @State private var returnMessage = ""
    @State private var showingStaff = false

    private var currentUser: User? { demoUsers.first { $0.id == sessionUserId } }
    private var signedIn: Bool { currentUser != nil && !sessionToken.isEmpty }

    var body: some View {
        NavigationStack {
            if signedIn, let user = currentUser {
                accountView(user)
            } else {
                loginView
            }
        }
    }

    private var loginView: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("ShopNorth")
                .font(.largeTitle.bold())
                .accessibilityIdentifier("brand-title")
            Text("Outdoor goods & everyday carry")
                .foregroundStyle(.secondary)
            TextField("Username", text: $username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("username-field")
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("password-field")
            Button("Sign in") { signIn() }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("sign-in-button")
            Text(message).foregroundStyle(.red)
            Spacer()
        }
        .padding()
    }

    private func accountView(_ user: User) -> some View {
        List {
            Section("Account") {
                Text("Welcome back, \(user.displayName)")
                Text("Gold rewards member")
                Text("Ship to: \(user.address)")
            }

            Section("Recommended gear") {
                productRow("Trail Runner Backpack", "$89.00")
                productRow("Insulated Coffee Tumbler", "$24.00")
                productRow("Merino Travel Hoodie", "$139.00")
            }

            Section("Recent orders") {
                ForEach(demoOrders.filter { $0.ownerId == user.id }) { order in
                    VStack(alignment: .leading) {
                        Text(order.id).font(.headline)
                        Text(order.items)
                        Text("\(order.status) · \(order.total)")
                    }
                    .accessibilityIdentifier("order-\(order.id)")
                }
            }

            Section("Return label") {
                Button("Create return label") { createReturnLabel(for: user) }
                    .accessibilityIdentifier("create-return-label")
                Text(returnMessage)
            }

            Section("Customer support") {
                NavigationLink("Contact support") { supportView(user) }
                Button("Staff customer directory") { showingStaff = true }
                    .accessibilityIdentifier("staff-directory-button")
            }

            Button("Log out") { logOut() }
                .foregroundStyle(.red)
                .accessibilityIdentifier("logout-button")
        }
        .navigationTitle("ShopNorth")
        .sheet(isPresented: $showingStaff) { staffDirectoryView }
    }

    private func productRow(_ name: String, _ price: String) -> some View {
        HStack { Text(name); Spacer(); Text(price).bold() }
    }

    private func supportView(_ user: User) -> some View {
        Form {
            Section("Saved profile") {
                Text(user.email)
                Text(user.address)
            }
            Section("Lookup another customer") {
                Picker("Customer", selection: $selectedCustomer) {
                    ForEach(demoUsers) { user in Text(user.displayName).tag(user) }
                }
                Text("API key: \(selectedCustomer.apiKey)")
                Text("Payment memo: \(selectedCustomer.paymentMemo)")
            }
            Section("Lookup order") {
                Picker("Order", selection: $selectedOrder) {
                    ForEach(demoOrders) { order in Text(order.id).tag(order) }
                }
                Text(selectedOrder.items)
                Text(selectedOrder.shippingAddress)
                Text(selectedOrder.paymentMemo)
            }
        }
        .navigationTitle("Support")
    }

    private var staffDirectoryView: some View {
        NavigationStack {
            List(demoUsers) { user in
                VStack(alignment: .leading) {
                    Text(user.displayName).font(.headline)
                    Text("\(user.role) · \(user.email)")
                    Text(user.apiKey).font(.caption)
                }
            }
            .navigationTitle("Staff Directory")
            .toolbar { Button("Done") { showingStaff = false } }
        }
    }

    private func signIn() {
        guard username == "exampleuser", password == "examplepassword" else {
            message = "Invalid username or password"
            return
        }
        let token = "hardcoded-ios-session.\(username).shopnorth"
        sessionToken = token
        sessionUserId = "u-100"
        UserDefaults.standard.set(token, forKey: "apiSessionToken")
        NSLog("ShopNorth login for \(username), token=\(token)")
    }

    private func logOut() {
        sessionToken = ""
        sessionUserId = ""
    }

    private func createReturnLabel(for user: User) {
        let text = "Return for \(user.displayName) at \(user.address). Token: \(sessionToken)"
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = documents.appendingPathComponent("return-label-\(user.id).txt")
        try? text.write(to: path, atomically: true, encoding: .utf8)
        returnMessage = "Return label created"
        NSLog("Created return label at \(path.path) containing token \(sessionToken)")
    }
}

extension User: Hashable {}
extension Order: Hashable {}
