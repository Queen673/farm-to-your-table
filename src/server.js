require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { z } = require('zod');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
// Create the folder used to store uploaded product images.
const uploadDirectory = path.join(__dirname, '..', 'public', 'uploads');

fs.mkdirSync(uploadDirectory, { recursive: true });

// Configure image storage.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${extension}`);
  }
});

// Accept image files only, with a 5 MB size limit.
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Please upload a JPG, PNG, or WebP image.'));
    }
  }
});
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production');
const secret = JWT_SECRET || 'development-only-secret-change-me';
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static('public'));

const fail = (res, status, message) => res.status(status).json({ error: message });
const tokenFor = user => jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '12h' });
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.cookies.ftyt_token;
  if (!token) return fail(res, 401, 'Please sign in.');
  try { req.auth = jwt.verify(token, secret); next(); } catch { return fail(res, 401, 'Session expired. Please sign in again.'); }
}
const roles = (...allowed) => (req, res, next) => !req.auth ? fail(res, 401, 'Please sign in.') : allowed.includes(req.auth.role) ? next() : fail(res, 403, 'You do not have permission to perform this action.');
const userById = id => prisma.user.findUnique({ where: { id }, include: { farmerProfile: true, driverProfile: true, buyerProfile: true } });

app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', database: 'connected', paymentMode: process.env.PAYMENT_MODE || 'mock' }); }
  catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});

app.post('/api/auth/register', async (req, res) => {
  const schema = z.object({ name: z.string().min(2).max(100), email: z.string().email().transform(v => v.toLowerCase()), phone: z.string().optional(), password: z.string().min(8), role: z.enum(['BUYER','FARMER','DRIVER']), region: z.string().optional(), division: z.string().optional(), locality: z.string().optional(), farmName: z.string().optional(), farmLocation: z.string().optional(), activities: z.string().optional(), businessName: z.string().optional(), vehicleType: z.string().optional(), vehicleRegistration: z.string().optional(), cargoCapacityKg: z.preprocess(value => value === '' || value == null ? undefined : value, z.coerce.number().positive().optional()), routes: z.string().optional(), deliveryAddress: z.string().optional() });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
  const d = parsed.data;
  try {
    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({ data: { name: d.name, email: d.email, phone: d.phone, passwordHash: await bcrypt.hash(d.password, 12), role: d.role, region: d.region, division: d.division, locality: d.locality } });
      if (d.role === 'FARMER') await tx.farmerProfile.create({ data: { userId: created.id, farmName: d.farmName, farmLocation: d.farmLocation, activities: d.activities } });
      if (d.role === 'DRIVER') await tx.driverProfile.create({ data: { userId: created.id, businessName: d.businessName, vehicleType: d.vehicleType, vehicleRegistration: d.vehicleRegistration, cargoCapacityKg: d.cargoCapacityKg, routes: d.routes } });
      if (d.role === 'BUYER') await tx.buyerProfile.create({ data: { userId: created.id, deliveryAddress: d.deliveryAddress } });
      return created;
    });
    const token = tokenFor(user); res.cookie('ftyt_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { if (e.code === 'P2002') return fail(res, 409, 'An account with this email already exists.'); console.error(e); fail(res, 500, 'Could not create account.'); }
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Enter a valid email and password.');
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail(res, 401, 'Email or password is incorrect.');
  const token = tokenFor(user); res.cookie('ftyt_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('ftyt_token'); res.json({ ok: true }); });
app.get('/api/auth/me', auth, async (req, res) => { const u = await userById(req.auth.sub); if (!u || !u.active) return fail(res, 401, 'Account unavailable.'); const { passwordHash, ...safe } = u; res.json({ user: safe }); });

app.get('/api/products', async (req, res) => {
  const where = { status: 'ACTIVE' };
  if (req.query.q) where.name = { contains: String(req.query.q), mode: 'insensitive' };
  if (req.query.region) where.farmer = { region: String(req.query.region) };
  if (req.query.hubId) where.hubId = String(req.query.hubId);
  const products = await prisma.product.findMany({ where, include: { farmer: { select: { id: true, name: true, region: true, farmerProfile: true } }, category: true, hub: true, preorder: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(products);
});
app.get('/api/hubs', async (_req, res) => res.json(await prisma.agriculturalHub.findMany({ where: { active: true }, orderBy: [{ region: 'asc' }, { name: 'asc' }] })));

app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);
app.post(
  '/api/products',
  auth,
  roles('FARMER'),
  upload.single('image'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      categoryId: z.string().optional(),
      hubId: z.string().optional(),
      unit: z.string().default('kg'),
      priceXaf: z.coerce.number().int().positive(),
      currentStock: z.coerce.number().int().min(0),
      imageUrl: z.string().url().optional()
    });

    const p = schema.safeParse(req.body);

    if (!p.success) {
      return fail(res, 400, p.error.issues[0].message);
    }

    try {
      const product = await prisma.product.create({
        data: {
          ...p.data,
          imageUrl: req.file
            ? `/uploads/${req.file.filename}`
            : p.data.imageUrl,
          priceXaf: new Prisma.Decimal(p.data.priceXaf),
          farmerId: req.auth.sub
        }
      });

      res.status(201).json(product);
    } catch (e) {
      console.error(e);
      fail(
        res,
        400,
        'Could not save product. Check the category and hub.'
      );
    }
  }
);

app.post('/api/orders', auth, roles('BUYER'), async (req, res) => {
  const parsed = z.object({ productId: z.string(), quantity: z.coerce.number().int().positive(), preorder: z.boolean().default(false), phone: z.string().optional(), carrier: z.enum(['MTN','ORANGE']).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
  const { productId, quantity, preorder } = parsed.data;
  try {
    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, include: { preorder: true } });
      if (!product) throw new Error('PRODUCT_UNAVAILABLE');
      let deposit = 0;
      if (preorder) {
        const listing = product.preorder; const now = new Date();
        if (!listing || listing.status !== 'OPEN' || now < listing.opensAt || now > listing.closesAt || listing.expectedHarvestAt <= now) throw new Error('PREORDER_CLOSED');
        const updated = await tx.preorderListing.updateMany({ where: { id: listing.id, status: 'OPEN', reservedQuantity: { lte: listing.preorderQuantity - quantity } }, data: { reservedQuantity: { increment: quantity } } });
        if (updated.count !== 1) throw new Error('INSUFFICIENT_STOCK');
        deposit = Math.ceil(Number(product.priceXaf) * quantity * listing.depositPercent / 100);
      } else {
        const updated = await tx.product.updateMany({ where: { id: product.id, currentStock: { gte: quantity }, status: 'ACTIVE' }, data: { currentStock: { decrement: quantity } } });
        if (updated.count !== 1) throw new Error('INSUFFICIENT_STOCK');
      }
      const subtotal = Number(product.priceXaf) * quantity;
      const rule = await tx.commissionRule.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
      const commission = Math.floor(subtotal * (rule?.percent ?? 5) / 100);
      const order = await tx.order.create({ data: { reference: `FTYT-${randomUUID().slice(0,8).toUpperCase()}`, buyerId: req.auth.sub, subtotalXaf: subtotal, depositXaf: deposit, totalXaf: preorder ? deposit : subtotal, commissionXaf: commission, items: { create: { productId, quantity, unitPriceXaf: product.priceXaf, lineTotalXaf: subtotal } } } });
      if (preorder) await tx.preorderReservation.create({ data: { listingId: product.preorder.id, orderId: order.id, quantity, depositXaf: deposit } });
      await tx.delivery.create({ data: { orderId: order.id, pickupLocation: product.farmerId, destination: 'Buyer delivery address pending' } });
      return order;
    }, { isolationLevel: 'Serializable' });
    res.status(201).json({ order: result, message: 'Order created. Complete payment to confirm it.' });
  } catch (e) { const map = { PRODUCT_UNAVAILABLE: [404,'Product is unavailable.'], PREORDER_CLOSED: [400,'Preorder is not currently open.'], INSUFFICIENT_STOCK: [409,'Not enough stock remains.'] }; if (map[e.message]) return fail(res, ...map[e.message]); console.error(e); fail(res, 500, 'Could not create order. Please try again.'); }
});
app.get('/api/orders', auth, async (req, res) => {
  const where = req.auth.role === 'ADMIN' ? {} : req.auth.role === 'BUYER' ? { buyerId: req.auth.sub } : req.auth.role === 'FARMER' ? { items: { some: { product: { farmerId: req.auth.sub } } } } : { delivery: { driver: { userId: req.auth.sub } } };
  const result = await prisma.order.findMany({ where, include: { buyer: { select: { name: true } }, items: { include: { product: { include: { farmer: { select: { name: true } } } } } }, payments: true, delivery: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(result);
});

// Mock mode is deliberately explicit. Live Fapshi calls must be implemented against current official docs.
app.post('/api/payments/mock', auth, roles('BUYER'), async (req, res) => {
  if ((process.env.PAYMENT_MODE || 'mock') !== 'mock') return fail(res, 403, 'Mock payments are disabled.');
  const p = z.object({ orderId: z.string().optional(), amountXaf: z.coerce.number().int().positive(), outcome: z.enum(['SUCCESSFUL','PENDING','FAILED']).default('SUCCESSFUL'), carrier: z.enum(['MTN','ORANGE']).optional(), phone: z.string().optional() }).safeParse(req.body);
  if (!p.success) return fail(res, 400, p.error.issues[0].message);
  if (!p.data.orderId) return fail(res, 400, 'A test payment must be linked to an order.');
  const key = `mock-${randomUUID()}`;
  try {
    const payment = await prisma.$transaction(async tx => {
      if (p.data.orderId) { const order = await tx.order.findFirst({ where: { id: p.data.orderId, buyerId: req.auth.sub } }); if (!order) throw new Error('ORDER_NOT_FOUND'); if (Number(order.totalXaf) !== p.data.amountXaf) throw new Error('AMOUNT_MISMATCH'); }
      const pay = await tx.payment.create({ data: { orderId: p.data.orderId, userId: req.auth.sub, amountXaf: p.data.amountXaf, status: p.data.outcome, carrier: p.data.carrier, phone: p.data.phone, provider: 'MOCK_TEST_ONLY', providerReference: key, idempotencyKey: key, rawStatus: p.data.outcome, verifiedAt: p.data.outcome === 'SUCCESSFUL' ? new Date() : null } });
      if (pay.status === 'SUCCESSFUL' && pay.orderId) {
        const order = await tx.order.update({ where: { id: pay.orderId }, data: { status: 'CONFIRMED' } });
        await tx.ledgerEntry.create({ data: { type: 'PAYMENT', userId: req.auth.sub, orderId: order.id, paymentId: pay.id, amountXaf: pay.amountXaf, status: 'CONFIRMED', idempotencyKey: `payment-${pay.id}` } });
        if (Number(order.commissionXaf) > 0) await tx.ledgerEntry.create({ data: { type: 'COMMISSION', orderId: order.id, paymentId: pay.id, amountXaf: order.commissionXaf, status: 'CONFIRMED', idempotencyKey: `commission-${order.id}` } }).catch(() => {});
      }
      return pay;
    });
    res.status(201).json({ payment, notice: 'DEVELOPMENT SIMULATION ONLY — not a real Mobile Money payment.' });
  } catch (e) { if (e.message === 'ORDER_NOT_FOUND') return fail(res, 404, 'Order not found.'); if (e.message === 'AMOUNT_MISMATCH') return fail(res, 400, 'Payment amount does not match the order.'); console.error(e); fail(res, 500, 'Payment simulation failed.'); }
});

app.get('/api/dashboard', auth, async (req, res) => {
  const role = req.auth.role; const uid = req.auth.sub;
  if (role === 'ADMIN') {
    const [users, farmers, drivers, buyers, products, orders, paid, activeFarmerSubs, activeDriverSubs, commission] = await Promise.all([
      prisma.user.count(), prisma.user.count({ where: { role: 'FARMER', active: true } }), prisma.user.count({ where: { role: 'DRIVER', active: true } }), prisma.user.count({ where: { role: 'BUYER', active: true } }), prisma.product.count(), prisma.order.count(), prisma.payment.aggregate({ where: { status: 'SUCCESSFUL' }, _sum: { amountXaf: true } }), prisma.subscription.count({ where: { status: 'ACTIVE', user: { role: 'FARMER' }, endsAt: { gt: new Date() } } }), prisma.subscription.count({ where: { status: 'ACTIVE', user: { role: 'DRIVER' }, endsAt: { gt: new Date() } } }), prisma.ledgerEntry.aggregate({ where: { type: 'COMMISSION', status: 'CONFIRMED' }, _sum: { amountXaf: true } })
    ]);
    return res.json({ role, users, farmers, drivers, buyers, products, orders, grossTransactionVolumeXaf: Number(paid._sum.amountXaf || 0), totalCommissionXaf: Number(commission._sum.amountXaf || 0), activeFarmerSubscriptions: activeFarmerSubs, activeDriverSubscriptions: activeDriverSubs });
  }
  if (role === 'BUYER') { const [orders, pending, completed, preorders] = await Promise.all([prisma.order.count({ where: { buyerId: uid } }), prisma.order.count({ where: { buyerId: uid, status: 'PENDING' } }), prisma.order.count({ where: { buyerId: uid, status: 'COMPLETED' } }), prisma.preorderReservation.count({ where: { order: { buyerId: uid } } })]); return res.json({ role, orders, pending, completed, preorders }); }
  if (role === 'FARMER') { const [products, stock, orders, preorders, sales] = await Promise.all([prisma.product.count({ where: { farmerId: uid, status: 'ACTIVE' } }), prisma.product.aggregate({ where: { farmerId: uid }, _sum: { currentStock: true } }), prisma.order.count({ where: { items: { some: { product: { farmerId: uid } } } } }), prisma.preorderListing.count({ where: { product: { farmerId: uid }, status: 'OPEN' } }), prisma.order.aggregate({ where: { status: { in: ['CONFIRMED','COMPLETED'] }, items: { some: { product: { farmerId: uid } } } }, _sum: { subtotalXaf: true } })]); return res.json({ role, products, currentStock: stock._sum.currentStock || 0, orders, activePreorders: preorders, salesXaf: Number(sales._sum.subtotalXaf || 0) }); }
  const [jobs, delivered, available] = await Promise.all([prisma.delivery.count({ where: { driver: { userId: uid } } }), prisma.delivery.count({ where: { driver: { userId: uid }, status: 'DELIVERED' } }), prisma.delivery.count({ where: { status: 'PENDING_ASSIGNMENT' } })]); res.json({ role, jobs, delivered, available });
});

app.get('/api/driver/jobs', auth, roles('DRIVER'), async (_req, res) => res.json(await prisma.delivery.findMany({ where: { OR: [{ status: 'PENDING_ASSIGNMENT' }, { driver: { userId: _req.auth.sub } }] }, include: { order: { include: { items: { include: { product: true } }, buyer: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 })));
app.post('/api/driver/jobs/:id/accept', auth, roles('DRIVER'), async (req, res) => {
  try { const driver = await prisma.driverProfile.findUnique({ where: { userId: req.auth.sub } }); if (!driver) return fail(res, 400, 'Driver profile is missing.'); const updated = await prisma.delivery.updateMany({ where: { id: req.params.id, status: 'PENDING_ASSIGNMENT', driverId: null }, data: { driverId: driver.id, status: 'ASSIGNED', assignedAt: new Date() } }); if (!updated.count) return fail(res, 409, 'This delivery has already been assigned.'); res.json({ ok: true }); } catch { fail(res, 500, 'Could not accept delivery.'); }
});
app.patch('/api/driver/jobs/:id/status', auth, roles('DRIVER'), async (req, res) => {
  const allowed = { ASSIGNED: ['ACCEPTED'], ACCEPTED: ['PICKED_UP'], PICKED_UP: ['IN_TRANSIT'], IN_TRANSIT: ['DELIVERED'] };
  const p = z.object({ status: z.enum(['ACCEPTED','PICKED_UP','IN_TRANSIT','DELIVERED']) }).safeParse(req.body); if (!p.success) return fail(res, 400, 'Invalid delivery status.');
  const driver = await prisma.driverProfile.findUnique({ where: { userId: req.auth.sub } }); const job = await prisma.delivery.findFirst({ where: { id: req.params.id, driverId: driver?.id } }); if (!job) return fail(res, 404, 'Delivery not found.'); if (!allowed[job.status]?.includes(p.data.status)) return fail(res, 409, 'Invalid status transition.');
  const updated = await prisma.delivery.update({ where: { id: job.id }, data: { status: p.data.status, ...(p.data.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}) } }); if (p.data.status === 'DELIVERED') await prisma.order.update({ where: { id: job.orderId }, data: { status: 'COMPLETED' } }); res.json(updated);
});

app.get('/api/admin/users', auth, roles('ADMIN'), async (_req, res) => res.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, phone: true, role: true, region: true, active: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 250 })));
app.patch('/api/admin/users/:id/active', auth, roles('ADMIN'), async (req, res) => { const p = z.object({ active: z.boolean() }).safeParse(req.body); if (!p.success) return fail(res, 400, 'active must be true or false.'); if (req.params.id === req.auth.sub) return fail(res, 400, 'You cannot deactivate your own admin account.'); const user = await prisma.user.update({ where: { id: req.params.id }, data: { active: p.data.active } }); await prisma.auditLog.create({ data: { actorId: req.auth.sub, action: p.data.active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', targetType: 'User', targetId: user.id } }); res.json({ id: user.id, active: user.active }); });
app.post('/api/admin/hubs', auth, roles('ADMIN'), async (req, res) => { const p = z.object({ name: z.string().min(2), region: z.string().min(2), division: z.string().optional(), locality: z.string().optional() }).safeParse(req.body); if (!p.success) return fail(res, 400, 'Enter a hub name and region.'); const hub = await prisma.agriculturalHub.create({ data: p.data }); await prisma.auditLog.create({ data: { actorId: req.auth.sub, action: 'HUB_CREATED', targetType: 'AgriculturalHub', targetId: hub.id } }); res.status(201).json(hub); });
app.post('/api/admin/commission', auth, roles('ADMIN'), async (req, res) => { const p = z.object({ name: z.string().min(2), percent: z.coerce.number().int().min(0).max(30) }).safeParse(req.body); if (!p.success) return fail(res, 400, 'Commission must be between 0 and 30 percent.'); await prisma.commissionRule.updateMany({ where: { active: true }, data: { active: false } }); const rule = await prisma.commissionRule.create({ data: p.data }); await prisma.auditLog.create({ data: { actorId: req.auth.sub, action: 'COMMISSION_RULE_CHANGED', targetType: 'CommissionRule', targetId: rule.id, details: { percent: rule.percent } } }); res.status(201).json(rule); });

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.get('*path', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); res.sendFile(require('path').resolve('public/index.html')); });
app.listen(PORT, () => console.log(`FTYT running on http://localhost:${PORT}`));
