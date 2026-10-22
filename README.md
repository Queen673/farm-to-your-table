Farm to Your Table (FTYT)

FTYT is a green‑themed, Cameroon‑focused agricultural marketplace prototype connecting buyers, farmers, and delivery drivers.  
It uses **Express, MySQL, Prisma**, and a responsive **vanilla‑JS frontend**, making it easy to run and inspect during a hackathon.

---

Features Implemented
- Public landing page and responsive marketplace
- Registration & login for **buyer, farmer, driver** roles (admin cannot self‑register)
- Password hashing, JWT authentication, protected API routes & role checks
- MySQL‑compatible Prisma schema for users, profiles, hubs, categories, products, preorders, orders, payments, subscriptions, deliveries, reviews, ledger & audit logs
- Farmer product creation and pre‑harvest listing
- Stock decrement & preorder reservation using database transactions
- Buyer order history & mock payment workflow
- Driver job board with concurrency‑safe job acceptance & guarded status transitions
- Admin APIs for metrics, user suspension/reactivation, commission configuration & hub creation
- Metrics computed directly from the database (empty DB starts at zero)

---

Prototype Limitations
1. `/api/payments/mock` is **test‑only**; no live MTN/Orange/Fapshi integration.  
2. Real payment flow requires Fapshi credentials & API docs.  
3. Subscription purchase/renewal not fully implemented.  
4. Not production‑ready: missing CSRF protection, email verification, password reset, stricter rate limits, refund workflows, payout flows, automated tests, and security review.  
5. Seed script creates only admin/settings; no demo users/products/orders.  
6. Ratings modeled but review submission flow not yet exposed.

---

 Requirements
- Node.js 20+
- MySQL database (XAMPP suitable for local dev)
- npm

---

## 💻 Local Setup
```bash
cp .env.example .env
