require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password || password === 'ChangeThisDemoPassword123!') {
    console.log('Skipping admin seed. Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in your private environment first.');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) await prisma.user.create({ data: { name: 'FTYT Administrator', email, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
  const regions = ['Adamawa','Centre','East','Far North','Littoral','North','North-West','South','South-West','West'];
  for (const name of ['Vegetables','Fruits','Grains','Tubers','Legumes','Herbs and spices','Poultry','Eggs','Fish','Livestock','Meat','Dairy products','Other agricultural produce']) await prisma.productCategory.upsert({ where: { name }, update: {}, create: { name } });
  for (const region of regions) await prisma.agriculturalHub.upsert({ where: { id: `region-${region.toLowerCase().replace(/[^a-z]+/g,'-')}` }, update: {}, create: { id: `region-${region.toLowerCase().replace(/[^a-z]+/g,'-')}`, name: `${region} Regional Hub`, region, active: false } }).catch(async () => { /* no default active hubs: admins configure actual locations */ });
  await prisma.commissionRule.createMany({ data: [{ name: 'Initial commission rule', percent: 5, active: true }], skipDuplicates: true });
  for (const plan of [{ role: 'FARMER', name: 'Farmer Monthly', priceXaf: 0, durationDays: 30 }, { role: 'DRIVER', name: 'Driver Monthly', priceXaf: 0, durationDays: 30 }]) await prisma.subscriptionPlan.upsert({ where: { role_name: { role: plan.role, name: plan.name } }, update: {}, create: plan });
  console.log('FTYT admin and configurable platform settings are ready. No demo users, products, orders or payments were created.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
