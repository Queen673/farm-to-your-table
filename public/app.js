const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let token = sessionStorage.getItem('ftyt_token') || '';
let currentUser = null, products = [], authMode = 'login', selectedProduct = null;
const regions = ['Adamawa','Centre','East','Far North','Littoral','North','North-West','South','South-West','West'];
const money = n => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n||0))+' XAF';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options={}) { const headers={'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) , ...(options.headers||{})}; const r=await fetch('/api'+path,{...options,headers,credentials:'same-origin'}); let data={}; try{data=await r.json()}catch{} if(!r.ok) throw new Error(data.error||'Something went wrong.'); return data; }
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3500)}
function openAuth(mode='login', role='BUYER'){authMode=mode;$('#authModal').classList.remove('hidden');setAuthMode(mode);$('#roleSelect').value=role;syncRoleFields();$('#authMessage').classList.add('hidden')}
function closeModal(el){el.classList.add('hidden')}
function setAuthMode(mode){authMode=mode;$('#tabLogin').classList.toggle('active',mode==='login');$('#tabRegister').classList.toggle('active',mode==='register');$('#registerFields').classList.toggle('hidden',mode!=='register');$('#authTitle').textContent=mode==='login'?'Your local market starts here.':'Join the FTYT community.';$('#authSubtitle').textContent=mode==='login'?'Sign in to your account.':'Create your account to get started.';$('#authSubmit').innerHTML=(mode==='login'?'Log in':'Create account')+' <span>→</span>';$('#authForm [name="password"]').autocomplete=mode==='login'?'current-password':'new-password';}
function syncRoleFields(){const role=$('#roleSelect').value;$('#farmerFields').classList.toggle('hidden',role!=='FARMER');$('#driverFields').classList.toggle('hidden',role!=='DRIVER');$('#buyerFields').classList.toggle('hidden',role!=='BUYER')}
function imageFor(p){if(p.imageUrl)return p.imageUrl;const n=(p.name||'').toLowerCase();if(/tomato/.test(n))return 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=600&q=80';if(/maize|corn/.test(n))return 'https://images.unsplash.com/photo-1601593768791-2a9d5d1f8e5a?auto=format&fit=crop&w=600&q=80';if(/plantain|banana/.test(n))return 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=600&q=80';if(/egg/.test(n))return 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=600&q=80';return 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'}
function renderProducts(){const q=$('#searchInput').value.toLowerCase().trim(), region=$('#regionFilter').value;const list=products.filter(p=>(!q||p.name.toLowerCase().includes(q)||String(p.description||'').toLowerCase().includes(q))&&(!region||p.farmer?.region===region));$('#productGrid').innerHTML=list.length?list.map(p=>{const pre=p.preorder;const harvest=pre?new Date(pre.expectedHarvestAt):null;const isPre=pre&&pre.status==='OPEN';return `<article class="product-card"><div class="product-image"><img src="${esc(imageFor(p))}" alt="${esc(p.name)}" loading="lazy"><span class="product-badge">${isPre?'Pre-harvest':'Available now'}</span></div><div class="product-content"><div class="product-meta"><span>${esc(p.category?.name||'Farm produce')}</span><span>📍 ${esc(p.farmer?.region||'Cameroon')}</span></div><h3>${esc(p.name)}</h3><div class="farmer-line">By ${esc(p.farmer?.farmerProfile?.farmName||p.farmer?.name||'Local farmer')}</div><div class="product-bottom"><div class="price">${money(p.priceXaf)} <small>/ ${esc(p.unit)}</small></div><button class="mini-btn" data-product="${esc(p.id)}">View / order</button></div>${isPre?`<div class="farmer-line" style="margin-top:10px">Harvest: ${harvest.toLocaleDateString()} · ${Math.max(0,pre.preorderQuantity-pre.reservedQuantity)} available to reserve</div>`:''}</div></article>`}).join(''):'<div class="empty-card"><b>No products listed yet.</b><br><br>When a farmer publishes produce, it will appear here automatically.</div>';$$('[data-product]').forEach(b=>b.addEventListener('click',()=>showProduct(b.dataset.product)))}
async function loadProducts(){try{products=await api('/products');renderProducts()}catch(e){$('#productGrid').innerHTML='<div class="empty-card">Marketplace could not load. Please refresh in a moment.</div>'}}
function showProduct(id){selectedProduct=products.find(p=>p.id===id);if(!selectedProduct)return;const p=selectedProduct,pre=p.preorder,isPre=pre&&pre.status==='OPEN';$('#productModalContent').innerHTML=`<img class="detail-image" src="${esc(imageFor(p))}" alt="${esc(p.name)}"><span class="eyebrow">${isPre?'PRE-HARVEST RESERVATION':'CURRENT STOCK'}</span><h2>${esc(p.name)}</h2><p class="detail-text">${esc(p.description||'Fresh produce from a local FTYT farmer.')}</p><p class="detail-text">Farmer: <b>${esc(p.farmer?.farmerProfile?.farmName||p.farmer?.name||'Local farmer')}</b> · ${esc(p.farmer?.region||'Cameroon')}</p><div class="detail-price">${money(p.priceXaf)} <small style="font-size:12px;color:#6e7d70">/ ${esc(p.unit)}</small></div><p class="detail-text">${isPre?`Expected harvest: ${new Date(pre.expectedHarvestAt).toLocaleDateString()}. Preorder deposit: ${pre.depositPercent}%. Remaining preorder quantity: ${pre.preorderQuantity-pre.reservedQuantity}.`:`Available stock: ${p.currentStock} ${esc(p.unit)}.`}</p><div class="detail-actions"><input id="orderQty" type="number" min="1" max="${isPre?Math.max(1,pre.preorderQuantity-pre.reservedQuantity):Math.max(1,p.currentStock)}" value="1" aria-label="Quantity"><button class="btn btn-primary" id="placeOrder">${isPre?'Reserve harvest':'Add order'} →</button></div><p class="form-note">Checkout currently supports clearly labelled development payment simulation. No real money will be charged.</p>`;$('#productModal').classList.remove('hidden');$('#placeOrder').addEventListener('click',()=>placeOrder(p,isPre))}
async function placeOrder(p,isPre){if(!currentUser){closeModal($('#productModal'));return openAuth('login','BUYER')}if(currentUser.role!=='BUYER'){toast('Please sign in with a buyer account to place an order.');return}const quantity=Number($('#orderQty').value);if(!Number.isInteger(quantity)||quantity<1)return toast('Enter a valid quantity.');try{const {order}=await api('/orders',{method:'POST',body:JSON.stringify({productId:p.id,quantity,preorder:!!isPre})});closeModal($('#productModal'));await loadProducts();await loadDashboard();showPayment(order);toast('Order created. Complete the test payment to confirm it.')}catch(e){toast(e.message)}}
function showPayment(order){const content=$('#productModalContent');content.innerHTML=`<div class="modal-logo">F</div><span class="eyebrow">CHECKOUT · TEST MODE</span><h2>Complete your order</h2><p class="detail-text">Order reference: <b>${esc(order.reference)}</b></p><p class="detail-text">Amount payable now: <b>${money(order.totalXaf)}</b></p><label style="display:block;margin-top:20px">Mobile Money network<select id="payCarrier"><option value="MTN">MTN Mobile Money</option><option value="ORANGE">Orange Money</option></select></label><label style="display:block;margin-top:12px">Phone number<input id="payPhone" placeholder="+237 6xx xxx xxx"></label><label style="display:block;margin-top:12px">Test result<select id="payOutcome"><option value="SUCCESSFUL">Successful (test only)</option><option value="PENDING">Pending (test only)</option><option value="FAILED">Failed (test only)</option></select></label><button class="btn btn-primary" id="runPayment" style="width:100%;margin-top:15px">Run test payment</button><p class="form-note">DEVELOPMENT SIMULATION ONLY — this does not contact MTN, Orange or Fapshi.</p>`;$('#productModal').classList.remove('hidden');$('#runPayment').addEventListener('click',async()=>{try{const payment=await api('/payments/mock',{method:'POST',body:JSON.stringify({orderId:order.id,amountXaf:Number(order.totalXaf),outcome:$('#payOutcome').value,carrier:$('#payCarrier').value,phone:$('#payPhone').value})});closeModal($('#productModal'));toast(`Test payment status: ${payment.payment.status}. ${payment.notice}`);await loadDashboard()}catch(e){toast(e.message)}})}
function addDashboard(){if($('#dashboardArea'))return;const sec=document.createElement('section');sec.id='dashboardArea';sec.className='section';sec.innerHTML='<div class="section-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h2 id="dashTitle">Dashboard</h2><p id="dashIntro">Your FTYT activity at a glance.</p></div><button class="btn btn-light" id="refreshDash">↻ Refresh data</button></div><div id="dashMetrics" class="dash-metrics"></div><div id="dashActions" class="dash-actions"></div><div id="dashContent"></div>';const marketplace=$('#marketplace');marketplace.parentNode.insertBefore(sec,marketplace);$('#refreshDash').addEventListener('click',loadDashboard)}
function metric(label,value){return `<div class="metric-card"><small>${esc(label)}</small><b>${esc(value)}</b></div>`}
async function loadDashboard(){if(!currentUser)return;addDashboard();$('#dashboardArea').classList.remove('hidden');$('#dashTitle').textContent=`Welcome, ${currentUser.name}`;$('#dashIntro').textContent=`${currentUser.role.toLowerCase()} workspace · Your records update from the FTYT database.`;try{const d=await api('/dashboard');const metrics= currentUser.role==='ADMIN'?[['Registered users',d.users],['Farmers',d.farmers],['Buyers',d.buyers],['Drivers',d.drivers],['Products',d.products],['Orders',d.orders],['Gross transaction volume',money(d.grossTransactionVolumeXaf)],['Commission',money(d.totalCommissionXaf)],['Farmer subscriptions',d.activeFarmerSubscriptions],['Driver subscriptions',d.activeDriverSubscriptions]]:currentUser.role==='FARMER'?[['Active products',d.products],['Current stock units',d.currentStock],['Orders',d.orders],['Open preorders',d.activePreorders],['Sales value',money(d.salesXaf)]]:currentUser.role==='DRIVER'?[['Assigned jobs',d.jobs],['Delivered',d.delivered],['Jobs available',d.available]]:[['Your orders',d.orders],['Pending orders',d.pending],['Completed orders',d.completed],['Preorder reservations',d.preorders]];$('#dashMetrics').innerHTML=metrics.map(m=>metric(...m)).join('');await renderRoleContent()}catch(e){$('#dashMetrics').innerHTML=`<div class="empty-card">${esc(e.message)}</div>`}}
async function renderRoleContent(){const a=$('#dashActions'),c=$('#dashContent');a.innerHTML='';c.innerHTML='';if(currentUser.role==='FARMER'){a.innerHTML='<button class="btn btn-primary" id="newProduct">＋ Add a product</button><button class="btn btn-outline" id="newPreorder">＋ Create pre-harvest listing</button>';$('#newProduct').onclick=()=>productForm();$('#newPreorder').onclick=()=>preorderForm();const mine=products.filter(p=>p.farmerId===currentUser.id);c.innerHTML=`<h3 class="dash-subhead">Your marketplace listings</h3>${mine.length?`<div class="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Current stock</th><th>Preorder</th></tr></thead><tbody>${mine.map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.priceXaf)}</td><td>${p.currentStock}</td><td>${p.preorder?'Listed':'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-card">You have not listed any products yet. Add your first product to start.</div>'}`}
else if(currentUser.role==='BUYER'){const orders=await api('/orders');c.innerHTML='<h3 class="dash-subhead">Your recent orders</h3>'+ (orders.length?`<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Status</th><th>Total</th><th>Date</th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.reference)}</td><td><span class="status-pill">${esc(o.status)}</span></td><td>${money(o.totalXaf)}</td><td>${new Date(o.createdAt).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-card">No orders yet. Browse the marketplace and select a product to get started.</div>')}
else if(currentUser.role==='DRIVER'){a.innerHTML='<button class="btn btn-primary" id="loadJobs">↻ Load delivery jobs</button>';$('#loadJobs').onclick=renderDriverJobs;await renderDriverJobs()}
else if(currentUser.role==='ADMIN'){a.innerHTML='<button class="btn btn-outline" id="loadUsers">Manage users</button><button class="btn btn-primary" id="setCommission">Set commission</button>';$('#loadUsers').onclick=renderAdminUsers;$('#setCommission').onclick=commissionForm();await renderAdminUsers()}}
function productForm() {
  const c = $('#dashContent');

  c.innerHTML = `
    <div class="form-panel">
      <h3>Add a product</h3>

      <form id="productCreate" enctype="multipart/form-data">

        <label>
          Product name
          <input name="name" required>
        </label>

        <label>
          Description
          <textarea name="description" rows="3"
            placeholder="Describe your farm produce"></textarea>
        </label>

        <div class="two-col">
          <label>
            Price (XAF per unit)
            <input name="priceXaf" type="number" min="1" required>
          </label>

          <label>
            Unit
            <input name="unit" value="kg" required>
          </label>
        </div>

        <label>
          Current stock quantity
          <input name="currentStock" type="number"
            min="0" value="0" required>
        </label>

        <label>
          Upload product image
          <input
            id="productImage"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          >
        </label>

        <div id="imagePreviewBox" class="hidden">
          <p>Image preview:</p>
          <img
            id="productImagePreview"
            alt="Selected product preview"
            style="width:100%;max-width:280px;border-radius:12px;"
          >
        </div>

        <p class="form-note">
          Upload a JPG, PNG, or WebP image. Maximum size: 5 MB.
        </p>

        <button class="btn btn-primary" id="saveProductButton">
          Save product
        </button>

      </form>
    </div>
  `;

  const form = $('#productCreate');
  const imageInput = $('#productImage');
  const previewBox = $('#imagePreviewBox');
  const preview = $('#productImagePreview');
  const saveButton = $('#saveProductButton');

  // Show a preview when the farmer selects an image.
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];

    if (!file) {
      previewBox.classList.add('hidden');
      preview.removeAttribute('src');
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      imageInput.value = '';
      previewBox.classList.add('hidden');
      toast('Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      imageInput.value = '';
      previewBox.classList.add('hidden');
      toast('Your image must be 5 MB or smaller.');
      return;
    }

    preview.src = URL.createObjectURL(file);
    previewBox.classList.remove('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    saveButton.disabled = true;
    saveButton.textContent = 'Saving product...';

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
        body: formData,
        credentials: 'same-origin'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not save product.'
        );
      }

      toast('Product saved successfully!');

      await loadProducts();
      await loadDashboard();

    } catch (err) {
      toast(err.message);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save product';
    }
  });
}
function preorderForm(){const mine=products.filter(p=>p.farmerId===currentUser.id);if(!mine.length){toast('Create a product first, then attach a harvest listing.');return productForm()}const c=$('#dashContent');c.innerHTML=`<div class="form-panel"><h3>Create a pre-harvest listing</h3><form id="preorderCreate"><label>Product<select name="productId" required>${mine.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><div class="two-col"><label>Harvest date<input name="expectedHarvestAt" type="datetime-local" required></label><label>Preorder closes<input name="closesAt" type="datetime-local" required></label></div><label>Preorder opens<input name="opensAt" type="datetime-local" required></label><div class="two-col"><label>Expected harvest quantity<input name="expectedQuantity" type="number" min="1" required></label><label>Preorder quantity<input name="preorderQuantity" type="number" min="1" required></label></div><label>Deposit percentage<input name="depositPercent" type="number" min="0" max="100" value="20" required></label><button class="btn btn-primary">Publish harvest listing</button></form></div>`;$('#preorderCreate').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));['expectedHarvestAt','opensAt','closesAt'].forEach(k=>d[k]=new Date(d[k]).toISOString());try{await api('/preorders',{method:'POST',body:JSON.stringify(d)});toast('Pre-harvest listing saved.');await loadProducts();await loadDashboard()}catch(err){toast(err.message)}}}
async function renderDriverJobs(){try{const jobs=await api('/driver/jobs');$('#dashContent').innerHTML='<h3 class="dash-subhead">Delivery board</h3>'+(jobs.length?`<div class="table-wrap"><table><thead><tr><th>Order</th><th>Pickup</th><th>Status</th><th>Action</th></tr></thead><tbody>${jobs.map(j=>`<tr><td>${esc(j.order.reference)}</td><td>${esc(j.pickupLocation||'Farm pickup')}</td><td>${esc(j.status)}</td><td>${j.status==='PENDING_ASSIGNMENT'?`<button class="mini-btn" data-accept="${j.id}">Accept job</button>`:j.status==='DELIVERED'?'Complete':`<select data-status="${j.id}"><option value="">Update status</option>${({ASSIGNED:['ACCEPTED'],ACCEPTED:['PICKED_UP'],PICKED_UP:['IN_TRANSIT'],IN_TRANSIT:['DELIVERED']}[j.status]||[]).map(s=>`<option>${s}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-card">No delivery jobs are available yet. Orders that need delivery will appear here.</div>');$$('[data-accept]').forEach(b=>b.onclick=async()=>{try{await api(`/driver/jobs/${b.dataset.accept}/accept`,{method:'POST',body:'{}'});toast('Delivery assigned to you.');await loadDashboard()}catch(e){toast(e.message)}});$$('[data-status]').forEach(s=>s.onchange=async()=>{if(!s.value)return;try{await api(`/driver/jobs/${s.dataset.status}/status`,{method:'PATCH',body:JSON.stringify({status:s.value})});toast('Delivery status updated.');await loadDashboard()}catch(e){toast(e.message)}})}catch(e){$('#dashContent').innerHTML=`<div class="empty-card">${esc(e.message)}</div>`}}
async function renderAdminUsers(){try{const users=await api('/admin/users');$('#dashContent').innerHTML='<h3 class="dash-subhead">User management</h3>'+(users.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Region</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.name)}<small class="table-small">${esc(u.email)}</small></td><td>${esc(u.role)}</td><td>${esc(u.region||'—')}</td><td>${u.active?'Active':'Suspended'}</td><td>${u.id===currentUser.id?'Current account':`<button class="mini-btn" data-toggle-user="${u.id}" data-active="${!u.active}">${u.active?'Suspend':'Reactivate'}</button>`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-card">No users have registered yet.</div>');$$('[data-toggle-user]').forEach(b=>b.onclick=async()=>{if(!confirm(`${b.dataset.active==='true'?'Reactivate':'Suspend'} this account?`))return;try{await api(`/admin/users/${b.dataset.toggleUser}/active`,{method:'PATCH',body:JSON.stringify({active:b.dataset.active==='true'})});toast('User status updated.');await loadDashboard()}catch(e){toast(e.message)}})}catch(e){$('#dashContent').innerHTML=`<div class="empty-card">${esc(e.message)}</div>`}}
function commissionForm(){return ()=>{const c=$('#dashContent');c.innerHTML=`<div class="form-panel"><h3>Configure commission</h3><form id="commissionCreate"><label>Rule name<input name="name" value="Standard transaction commission" required></label><label>Commission percentage<input name="percent" type="number" min="0" max="30" value="5" required></label><button class="btn btn-primary">Save commission rule</button></form></div>`;$('#commissionCreate').onsubmit=async e=>{e.preventDefault();try{await api('/admin/commission',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Commission rule saved.');await loadDashboard()}catch(err){toast(err.message)}}}}
async function afterLogin(user){currentUser=user;$('#loginOpen').classList.add('hidden');$('#registerOpen').classList.add('hidden');$('#accountNav').classList.remove('hidden');$('#navUser').textContent=`${user.name} · ${user.role}`;closeModal($('#authModal'));$('#dashboardArea')?.remove();addDashboard();await loadDashboard();$('#dashboardArea').scrollIntoView({behavior:'smooth',block:'start'});await loadProducts()}
$('#authForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const msg=$('#authMessage');msg.classList.add('hidden');try{let out;if(authMode==='register'){if(d.role==='ADMIN')throw new Error('Admin accounts are provisioned securely, not through public registration.');out=await api('/auth/register',{method:'POST',body:JSON.stringify(d)})}else out=await api('/auth/login',{method:'POST',body:JSON.stringify({email:d.email,password:d.password})});token=out.token;sessionStorage.setItem('ftyt_token',token);await afterLogin(out.user)}catch(err){msg.textContent=err.message;msg.classList.remove('hidden')}});
$('#loginOpen').onclick=()=>openAuth('login');$('#registerOpen').onclick=()=>openAuth('register');$('#farmerJoin').onclick=()=>openAuth('register','FARMER');$('#ctaJoin').onclick=()=>openAuth('register');$('#tabLogin').onclick=()=>setAuthMode('login');$('#tabRegister').onclick=()=>setAuthMode('register');$('#roleSelect').onchange=syncRoleFields;$('#searchInput').oninput=renderProducts;$('#regionFilter').onchange=renderProducts;$('#preorderLearn').onclick=()=>document.querySelector('#how').scrollIntoView({behavior:'smooth'});$$('[data-role]').forEach(b=>b.onclick=()=>openAuth('register',b.dataset.role));$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.closest('.modal')));document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal').forEach(closeModal)});
$('#logoutBtn').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}token='';currentUser=null;sessionStorage.removeItem('ftyt_token');$('#loginOpen').classList.remove('hidden');$('#registerOpen').classList.remove('hidden');$('#accountNav').classList.add('hidden');$('#dashboardArea')?.remove();toast('You have logged out.');};
async function init(){ $('#year').textContent=new Date().getFullYear();await loadProducts();if(token){try{const r=await api('/auth/me');await afterLogin(r.user)}catch{token='';sessionStorage.removeItem('ftyt_token')}}}
init();
