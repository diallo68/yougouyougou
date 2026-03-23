// ═══════════════════════════════════════════════════════════
//  YouGouYou — server.js  v3.0
//  Stack : Node.js + Express + MongoDB Atlas + JWT
//  Nouvelles APIs : Messagerie · Avis · Alertes · Signalements
//                   Boost · Stats vendeur · Profil public
// ═══════════════════════════════════════════════════════════

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
// ── SMS via Africa's Talking ────────────────────────────────
async function sendSMS(phone, message) {
  const username = process.env.AT_USERNAME || 'sandbox';
  const apiKey   = process.env.AT_API_KEY  || '';
  if (!apiKey) { console.warn('[SMS] AT_API_KEY manquant'); return false; }

  const isLive = username !== 'sandbox';
  const host   = isLive ? 'api.africastalking.com' : 'api.sandbox.africastalking.com';
  const path_  = '/version1/messaging';

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('to',       phone);
  params.append('message',  message);
  // AT_SENDER désactivé — shortcode automatique AT (fonctionne sans approbation)
  // Pour réactiver un Sender ID custom : l'enregistrer d'abord sur AT Dashboard
  // if (isLive && process.env.AT_SENDER) params.append('from', process.env.AT_SENDER);

  const body = params.toString();

  return new Promise((resolve) => {
    const options = {
      hostname: host,
      path:     path_,
      method:   'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey':       apiKey,
        'Content-Length': Buffer.byteLength(body),
      }
    };
    console.log(`[SMS] Envoi → ${host}${path_} | username=${username} | to=${phone} | isLive=${isLive}`);
    const req = require('https').request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const recipient = json?.SMSMessageData?.Recipients?.[0];
          const statusCode = recipient?.statusCode;
          const status = recipient?.status;
          const ok = statusCode === 100 || statusCode === 101;
          if(ok){
            console.log(`[SMS] ✅ Envoyé → ${phone} | statusCode=${statusCode}`);
          } else {
            const msg = json?.SMSMessageData?.Message || status || 'Erreur inconnue';
            console.error(`[SMS] ❌ Échec → ${phone} | code=${statusCode} | "${msg}"`);
          }
          resolve(ok);
        } catch(e) {
          console.error('[SMS] Parse erreur:', e.message);
          console.error('[SMS] Réponse brute:', data);
          resolve(false);
        }
      });
    });
    req.on('error', (e) => {
      console.error('[SMS] Erreur réseau:', e.message);
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}



// ── MIDDLEWARE ──────────────────────────────────────────────
try { app.use(require('compression')()); } catch(e) {}
try {
  const rateLimit = require('express-rate-limit');
  app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }));
} catch(e) {}
try { app.use(require('helmet')({ contentSecurityPolicy: false })); } catch(e) {}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── CONNEXION MONGODB ATLAS ─────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas connecté'))
.catch(err => console.error('❌ MongoDB erreur :', err));

// ── EMAIL (SendGrid) ────────────────────────────────────────
if (process.env.SENDGRID_API_KEY) {
  console.log('✅ [EMAIL] SendGrid configuré — depuis:', process.env.EMAIL_FROM || 'noreply@yougouyougou.net');
} else {
  console.warn('⚠️ [EMAIL] SENDGRID_API_KEY non défini');
}

async function sendEmail(to, subject, html, text) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) { console.warn('[EMAIL] SendGrid non configuré →', to, subject); return; }
  const fromEmail = process.env.EMAIL_FROM || 'noreply@yougouyougou.net';
  console.log(`[EMAIL] Tentative envoi | from=${fromEmail} | to=${to} | subject="${subject}"`);
  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: 'YouGouYou 🇬🇳' },
    subject,
    content: [
      { type: 'text/plain', value: text || subject },
      { type: 'text/html',  value: html }
    ]
  });
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error(`[EMAIL] SendGrid erreur ${response.status} | from=${fromEmail} | to=${to}:`, responseText);
    throw new Error(`SendGrid ${response.status}: ${responseText}`);
  }
  console.log(`✅ [EMAIL] Envoyé | from=${fromEmail} | to=${to} | status=${response.status}`);
}

function emailVerifHTML(prenom, code) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#F5F2EE;font-family:Helvetica Neue,Arial,sans-serif">
    <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="background:linear-gradient(135deg,#FF5C00,#FF6A00);padding:36px 40px;text-align:center">
        <div style="font-size:36px;margin-bottom:10px">&#127468;&#127475;</div>
        <div style="font-size:26px;font-weight:900;color:#fff">YouGouYou</div>
        <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px">Le marché de la Guinée</div>
      </div>
      <div style="padding:36px 40px">
        <p style="font-size:16px;color:#0E0E0E">Bonjour <strong>${prenom}</strong> 👋</p>
        <p style="font-size:14px;color:#767676;line-height:1.7;margin-bottom:28px">Voici votre code de vérification YouGouYou.</p>
        <div style="background:#FFF3EE;border:2px solid #FFB899;border-radius:16px;padding:28px;text-align:center;margin-bottom:28px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#767676;margin-bottom:10px">Code de vérification</div>
          <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#FF5C00">${code}</div>
          <div style="font-size:12px;color:#767676;margin-top:10px">Expire dans 15 minutes</div>
        </div>
        <p style="font-size:13px;color:#A8A8A8">Si vous n'avez pas créé de compte YouGouYou, ignorez cet email.</p>
      </div>
      <div style="background:#F5F2EE;padding:20px 40px;text-align:center;border-top:1px solid #E2DDD7">
        <div style="font-size:12px;color:#A8A8A8">&copy; 2025 YouGouYou &middot; Conakry, Guinée<br>
          <a href="https://yougouyougou.net" style="color:#FF5C00;text-decoration:none">yougouyougou.net</a></div>
      </div>
    </div>
  </body></html>`;
}

function emailAlertHTML(alert, ad) {
  const price = (ad.price||0).toLocaleString('fr-FR');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#F5F2EE;font-family:Helvetica Neue,Arial,sans-serif">
    <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="background:linear-gradient(135deg,#FF5C00,#FF6A00);padding:24px 40px;text-align:center">
        <div style="font-size:24px;font-weight:900;color:#fff">🔔 Nouvelle annonce !</div>
        <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px">Votre alerte YouGouYou a trouvé une correspondance</div>
      </div>
      <div style="padding:28px 40px">
        <p style="font-size:14px;color:#767676">Alerte : <strong>${alert.query||alert.category||'Toutes catégories'}</strong></p>
        <div style="border:1.5px solid #E2DDD7;border-radius:12px;overflow:hidden;margin:16px 0">
          ${ad.photos&&ad.photos[0] ? `<img src="${ad.photos[0]}" style="width:100%;height:200px;object-fit:cover">` : ''}
          <div style="padding:16px">
            <div style="font-size:18px;font-weight:800;color:#0E0E0E;margin-bottom:8px">${ad.title}</div>
            <div style="font-size:22px;font-weight:900;color:#FF5C00;margin-bottom:8px">${price} GNF</div>
            <div style="font-size:13px;color:#767676">📍 ${ad.city||'Guinée'} &middot; ${ad.category||''}</div>
          </div>
        </div>
        <a href="https://yougouyougou.net" style="display:block;background:#FF5C00;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:800;font-size:15px">Voir l'annonce →</a>
      </div>
      <div style="background:#F5F2EE;padding:16px 40px;text-align:center;border-top:1px solid #E2DDD7">
        <div style="font-size:11px;color:#A8A8A8">Pour vous désabonner de cette alerte, connectez-vous sur <a href="https://yougouyougou.net" style="color:#FF5C00">yougouyougou.net</a></div>
      </div>
    </div>
  </body></html>`;
}

// ═══════════════════════════════════════════════════════════
//  SCHÉMAS MONGOOSE
// ═══════════════════════════════════════════════════════════

// ── Utilisateur ─────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  prenom:       { type: String, required: true, trim: true },
  nom:          { type: String, trim: true },
  phone:        { type: String, unique: true, sparse: true },
  email:        { type: String, trim: true, lowercase: true },
  password:     { type: String, required: true },
  city:         { type: String },
  dob:          { type: String },   // date de naissance (YYYY-MM-DD)
  pob:          { type: String },   // lieu de naissance
  role:         { type: String, enum: ['user','admin'], default: 'user' },
  verified:     { type: Boolean, default: false },
  verifyMethod: { type: String, enum: ['sms','email'], default: 'sms' },
  verifyCode:   { type: String },
  codeExpiry:   { type: Date },
  isPro:        { type: Boolean, default: false },        // compte pro payant
  proUntil:     { type: Date },                           // expiration abonnement pro
  boutiqueName:    { type: String, maxlength: 100 },
  boutiqueDesc:    { type: String, maxlength: 1000 },
  boutiqueSlogan:  { type: String, maxlength: 200 },
  boutiqueBanner:  { type: String },
  boutiqueSector:  { type: String },
  boutiqueHours:   { type: mongoose.Schema.Types.Mixed, default: {} },
  boutiqueSocial:  {
    whatsapp:  { type: String },
    facebook:  { type: String },
    instagram: { type: String },
    tiktok:    { type: String },
    website:   { type: String },
  },
  boutiquePinned:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ad' }],
  boutiqueItems:   [{
    _id:         { type: mongoose.Schema.Types.ObjectId, auto: true },
    name:        { type: String, required: true },
    price:       { type: Number, default: 0 },
    desc:        { type: String },
    photo:       { type: String },   // base64 ou URL
    category:    { type: String },   // niveau 1
    subCategory: { type: String },   // niveau 2
    subItem:     { type: String },   // niveau 3
    inStock:     { type: Boolean, default: true },
    createdAt:   { type: Date, default: Date.now },
  }],
  avgRating:    { type: Number, default: 0 },             // note moyenne (dénormalisée)
  ratingCount:  { type: Number, default: 0 },             // nb d'avis
  totalViews:   { type: Number, default: 0 },             // vues totales sur ses annonces
  totalContacts:{ type: Number, default: 0 },             // contacts reçus
  favorites:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ad' }], // annonces favorites
  createdAt:    { type: Date, default: Date.now },
});
UserSchema.index({ phone: 1 });
UserSchema.index({ email: 1 });
const User = mongoose.model('User', UserSchema);

// ── Annonce ──────────────────────────────────────────────────
const AdSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String },
  price:        { type: Number, required: true },
  category:     { type: String, index: true },
  subCategory:  { type: String, index: true },   // niveau 2
  subItem:      { type: String },                // niveau 3
  city:         { type: String, index: true },
  quartier:     { type: String },
  etat:         { type: String },
  condition:    { type: String },
  emoji:        { type: String, default: '📦' },
  photos:       [String],
  tags:         [String],
  featured:     { type: Boolean, default: false },
  featuredUntil:{ type: Date },                           // expiration vedette
  boostedAt:    { type: Date },                           // date dernière remontée
  urgentBadge:  { type: Boolean, default: false },        // badge URGENT
  urgentUntil:  { type: Date },
  nego:         { type: Boolean, default: false },         // prix négociable
  subFields:    { type: Map, of: String },                // champs spécifiques par catégorie
  views:        { type: Number, default: 0 },
  seller:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  sellerName:   { type: String },
  sellerPhone:  { type: String },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Date, default: Date.now },
});
// Index composé pour les recherches fréquentes
AdSchema.index({ category: 1, city: 1, price: 1, createdAt: -1 });
AdSchema.index({ active: 1, createdAt: -1 });
AdSchema.index({ seller: 1, createdAt: -1 });
AdSchema.index({ title: 'text', description: 'text' });   // full-text search
const Ad = mongoose.model('Ad', AdSchema);

// ── Paiement ─────────────────────────────────────────────────
const PaymentSchema = new mongoose.Schema({
  type:       { type: String, enum: ['purchase','commission','boost'], default: 'purchase' },
  buyer:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  buyerPhone: { type: String },
  ad:         { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  adTitle:    { type: String },
  amount:     { type: Number, required: true },
  commission: { type: Number, default: 0 },
  boostType:  { type: String },                           // 'feature','boost','urgent'
  reference:  { type: String, unique: true },
  status:     { type: String, enum: ['pending','success','failed'], default: 'success' },
  createdAt:  { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', PaymentSchema);

// ── ★ NOUVEAU : Conversation / Messagerie ────────────────────
const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:     { type: String, required: true, maxlength: 2000 },
  isSystem: { type: Boolean, default: false },  // message système (frais, info auto)
  read:     { type: Boolean, default: false },
  createdAt:{ type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  adId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
  adTitle:    { type: String },
  buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerName:  { type: String },
  sellerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerName: { type: String },
  messages:   [MessageSchema],
  lastMessage:{ type: String },
  unreadBuyer:{ type: Number, default: 0 },    // non lus pour l'acheteur
  unreadSeller:{ type: Number, default: 0 },   // non lus pour le vendeur
  updatedAt:  { type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now },
});
ConversationSchema.index({ buyerId: 1, updatedAt: -1 });
ConversationSchema.index({ sellerId: 1, updatedAt: -1 });
ConversationSchema.index({ adId: 1, buyerId: 1 }, { unique: true }); // 1 conv par (annonce, acheteur)
const Conversation = mongoose.model('Conversation', ConversationSchema);

// ── ★ NOUVEAU : Avis / Notation vendeurs ─────────────────────
const ReviewSchema = new mongoose.Schema({
  reviewerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewerName: { type: String },
  sellerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  rating:       { type: Number, required: true, min: 1, max: 5 },
  comment:      { type: String, maxlength: 1000 },
  createdAt:    { type: Date, default: Date.now },
});
ReviewSchema.index({ sellerId: 1, createdAt: -1 });
ReviewSchema.index({ reviewerId: 1, sellerId: 1 }, { unique: true }); // 1 avis par (auteur, vendeur)
const Review = mongoose.model('Review', ReviewSchema);

// ── ★ NOUVEAU : Alertes de recherche ─────────────────────────
const AlertSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query:     { type: String },
  category:  { type: String },
  city:      { type: String },
  priceMin:  { type: Number, default: 0 },
  priceMax:  { type: Number, default: 0 },
  lastSentAt:{ type: Date },               // dernière notif envoyée
  active:    { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
AlertSchema.index({ userId: 1 });
AlertSchema.index({ active: 1 });
const Alert = mongoose.model('Alert', AlertSchema);

// ── ★ NOUVEAU : Signalements ──────────────────────────────────
const ReportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
  reason:     { type: String, required: true, enum: ['arnaque','interdit','doublon','prix','photo','autre'] },
  details:    { type: String, maxlength: 500 },
  status:     { type: String, enum: ['pending','reviewed','dismissed'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now },
});
ReportSchema.index({ adId: 1 });
ReportSchema.index({ status: 1, createdAt: -1 });
const Report = mongoose.model('Report', ReportSchema);

// ── ★ NOUVEAU : Réinitialisation mot de passe ─────────────────
const ResetTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used:      { type: Boolean, default: false },
});
const ResetToken = mongoose.model('ResetToken', ResetTokenSchema);

// ═══════════════════════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET || 'ygy_secret_change_in_prod';

function genRef() {
  return 'OM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
}

// Middleware auth (requis)
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Middleware auth optionnel (enrichit req.user si token présent, ne bloque pas)
function authOptional(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch {}
  }
  next();
}

// Middleware admin uniquement
// Middleware : admin uniquement (vérifie MongoDB, pas le JWT)
async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé — admin uniquement' });
    }
    // Mettre à jour req.user.role avec la vraie valeur MongoDB
    req.user.role = user.role;
    next();
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

// Middleware : Pro ou Admin (vérifie toujours MongoDB)
async function requirePro(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('isPro proUntil role');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    // Admin a tous les droits (rôle vérifié depuis MongoDB)
    if (user.role === 'admin') { req.user.role = 'admin'; return next(); }
    // Vérifier Pro actif
    if (!user.isPro) return res.status(403).json({ error: 'Réservé aux membres Pro' });
    if (user.proUntil && user.proUntil < new Date()) {
      await User.findByIdAndUpdate(req.user.id, { isPro: false });
      return res.status(403).json({ error: 'Votre abonnement Pro a expiré' });
    }
    next();
  } catch(err) { res.status(500).json({ error: err.message }); }
}

// Middleware : utilisateur authentifié (user, pro ou admin)
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  next();
}

// Recalcule et persiste la note moyenne d'un vendeur
async function recalcSellerRating(sellerId) {
  const result = await Review.aggregate([
    { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const avg   = result[0]?.avg   || 0;
  const count = result[0]?.count || 0;
  await User.findByIdAndUpdate(sellerId, {
    avgRating: Math.round(avg * 10) / 10,
    ratingCount: count
  });
}

// ═══════════════════════════════════════════════════════════
//  AUTH — INSCRIPTION / CONNEXION
// ═══════════════════════════════════════════════════════════

// Étape 1 : envoyer le code de vérification
app.post('/api/auth/send-code', async (req, res) => {
  try {
    const { phone, email, method = 'sms', prenom = 'Utilisateur' } = req.body;
    console.log(`[SEND-CODE] Reçu: method=${method} phone="${phone}" email="${email}" prenom="${prenom}"`);
    if (method === 'sms'   && !phone) return res.status(400).json({ error: 'Numéro requis pour SMS' });
    if (method === 'email' && !email) return res.status(400).json({ error: 'Email requis' });

    const code   = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // Chercher un user existant
    let existing = null;
    if (method === 'sms' && phone)   existing = await User.findOne({ phone });
    if (method === 'email' && email) existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
      // Mettre à jour le code sur l'user existant
      existing.verifyCode  = code;
      existing.codeExpiry  = expiry;
      existing.method      = method;
      await existing.save();
    } else {
      // Créer un document temporaire avec les infos minimales
      const tempUser = {
        prenom: prenom,
        nom: '',
        verifyCode: code,
        codeExpiry: expiry,
        method,
        password: 'pending_' + code, // sera remplacé à l'inscription
        verified: false,
      };
      if (method === 'sms') {
        tempUser.phone = phone;
      } else {
        // Mode email : phone fictif unique basé sur l'email
        tempUser.email = email.toLowerCase();
        tempUser.phone = 'em_' + Date.now(); // phone unique temporaire
      }
      console.log(`[SEND-CODE] Création tempUser: phone="${tempUser.phone}" email="${tempUser.email||''}"`);
      try {
        await User.create(tempUser);
        console.log(`[SEND-CODE] TempUser créé ✅`);
      } catch(createErr) {
        // E11000 = phone déjà en base (doublon) → récupérer l'existant et mettre à jour le code
        if (createErr.code === 11000) {
          console.warn(`[SEND-CODE] Doublon détecté — mise à jour code sur user existant`);
          const dup = method === 'sms'
            ? await User.findOne({ phone })
            : await User.findOne({ email: email.toLowerCase() });
          if (dup) {
            dup.verifyCode = code;
            dup.codeExpiry = expiry;
            await dup.save();
            console.log(`[SEND-CODE] Code mis à jour sur user existant ✅`);
          } else {
            throw createErr; // vraie erreur inconnue
          }
        } else {
          throw createErr;
        }
      }
    }

    // Envoyer le code
    let emailSent = false;
    let smsSent   = false;
    if (method === 'sms') {
      console.log(`[SEND-CODE] Envoi SMS → ${phone} code=${code}`);
      smsSent = await sendSMS(phone, `Votre code YouGouYou : ${code}. Valable 15 min.`);
      console.log(`[SEND-CODE] SMS résultat: smsSent=${smsSent}`);
      if (!smsSent) console.warn(`[SMS] Échec → ${phone} code=${code}`);
    } else {
      try {
        await sendEmail(email,
          `${code} — Votre code YouGouYou`,
          emailVerifHTML(prenom, code),
          `Bonjour ${prenom}, votre code YouGouYou : ${code} (expire dans 15 min)`
        );
        emailSent = true;
        console.log(`[EMAIL] Code envoyé à ${email}`);
      } catch(e) { console.error('[EMAIL] Échec:', e.message); }
    }

    res.json({
      success: true, method,
      smsSent, emailSent,
      debug_code: process.env.NODE_ENV !== 'production' ? code : undefined,
      message: method === 'sms'
        ? (smsSent ? `SMS envoyé au ${phone}` : `Code généré`)
        : (emailSent ? `Email envoyé à ${email}` : `Erreur envoi email`)
    });
  } catch(err) {
    console.error('[SEND-CODE] Erreur FATALE:', err.code, err.message);
    // Renvoyer une erreur claire au front au lieu de planter silencieusement
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
});

// Étape 2 : vérifier le code et créer le compte
app.post('/api/register', async (req, res) => {
  try {
    const { prenom, nom, phone, email, password, city, code, method = 'sms', dob } = req.body;
    if (!prenom || !password || !code)
      return res.status(400).json({ error: 'Champs requis manquants' });

    // ── Vérification âge minimum 18 ans ──────────────────────────
    if (!dob) return res.status(400).json({ error: 'Date de naissance requise' });
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return res.status(400).json({ error: 'Date de naissance invalide' });
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) return res.status(400).json({ error: 'Vous devez avoir au moins 18 ans pour créer un compte' });
    // ─────────────────────────────────────────────────────────────

    // Chercher le user temporaire créé lors du send-code
    let pending = null;
    if (method === 'email' && email) {
      pending = await User.findOne({ email: email.toLowerCase() });
    } else if (phone) {
      pending = await User.findOne({ phone });
    }

    console.log(`[REGISTER] method=${method} email="${email}" phone="${phone}" found=${!!pending} code_stored=${pending?.verifyCode} code_sent=${code}`);

    if (!pending) return res.status(400).json({ error: "Demandez d'abord un code de vérification" });
    if (!pending.verifyCode) return res.status(400).json({ error: 'Code expiré — demandez un nouveau code' });
    if (pending.verifyCode !== code) return res.status(400).json({ error: 'Code incorrect' });
    if (pending.codeExpiry && new Date() > pending.codeExpiry)
      return res.status(400).json({ error: 'Code expiré — demandez un nouveau code' });

    // Compte déjà vérifié → connexion directe
    if (pending.verified) {
      const token = jwt.sign({ id: pending._id, role: pending.role }, JWT_SECRET, { expiresIn: '90d' });
      return res.json({
        success: true, token,
        user: { id: pending._id, name: `${pending.prenom} ${pending.nom||''}`.trim(),
                prenom: pending.prenom, nom: pending.nom||'',
                phone: pending.phone||'', email: pending.email||'',
                city: pending.city||'', role: pending.role }
      });
    }

    // Finaliser l'inscription — mettre à jour le document temporaire
    const hashed = await bcrypt.hash(password, 10);
    pending.prenom    = prenom;
    pending.nom       = nom || '';
    pending.password  = hashed;
    pending.city      = city || '';
    pending.dob       = dob;
    pending.verified  = true;
    pending.verifyCode  = null;
    pending.codeExpiry  = null;
    pending.email     = (email || pending.email || '').toLowerCase();
    // Ne mettre à jour phone que si fourni (éviter d'écraser le phone fictif par '')
    if (phone) pending.phone = phone;
    await pending.save();

    const token = jwt.sign({ id: pending._id, role: pending.role }, JWT_SECRET, { expiresIn: '90d' });
    console.log(`[REGISTER] ✅ Compte créé: ${pending._id} email=${pending.email}`);
    res.json({
      success: true, token,
      user: { id: pending._id, name: `${prenom} ${nom||''}`.trim(),
              prenom, nom: nom||'',
              phone: pending.phone||'', email: pending.email||'',
              city: city||'', role: pending.role }
    });
  } catch(err) {
    console.error('[REGISTER] Erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── Renouvellement de token ──
app.post('/api/auth/refresh', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -verifyCode -codeExpiry');
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    const newToken = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token: newToken, user: {
      id: user._id, role: user.role,
      prenom: user.prenom, nom: user.nom||'',
      phone: user.phone||'', email: user.email||'',
      city: user.city||'', isPro: user.isPro||false,
    }});
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    const phoneVariants = [identifier, '+224'+identifier.replace(/^\+224/,''), identifier.replace(/^\+224/,'')];
    const user = await User.findOne({
      $or: [{ phone: { $in: phoneVariants } }, { email: identifier.toLowerCase() }]
    });
    if (!user) return res.status(400).json({ error: 'Compte introuvable' });
    if (!user.verified) return res.status(400).json({ error: 'Compte non vérifié' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '90d' });
    res.json({
      success: true, token,
      user: { id: user._id, name: `${user.prenom} ${user.nom||''}`.trim(),
              phone: user.phone, email: user.email, city: user.city, role: user.role }
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Renvoyer un code
app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const { phone, email, method = 'sms', prenom = 'Utilisateur' } = req.body;
    const code   = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await User.findOneAndUpdate({ phone }, { verifyCode: code, codeExpiry: expiry }, { upsert: true });
    if (method === 'email' && email) {
      await sendEmail(email, `${code} — Nouveau code YouGouYou`, emailVerifHTML(prenom, code), `Code : ${code}`);
    } else if (phone) {
      const smsSent = await sendSMS(phone, `Votre nouveau code YouGouYou : ${code}. Valable 15 min.`);
      if (!smsSent) console.warn(`[RESEND] SMS non livré → ${phone} code: ${code}`);
    }
    res.json({ success: true, debug_code: code });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Reset mot de passe — étape 1 : demander le lien
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, phone } = req.body;
    const query = email ? { email: email.toLowerCase() } : { phone };
    const user  = await User.findOne(query);
    if (!user) return res.json({ success: true }); // ne pas révéler si l'email existe

    const token  = require('crypto').randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await ResetToken.create({ userId: user._id, token, expiresAt: expiry });

    const resetUrl = `https://yougouyougou.net?reset=${token}`;
    if (email) {
      const textBody = `Bonjour ${user.prenom},\n\nVous avez demandé la réinitialisation de votre mot de passe YouGouYou.\n\nCliquez sur ce lien pour créer un nouveau mot de passe :\n${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\n— L'équipe YouGouYou`;
      const htmlBody = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#FF5C00;padding:28px 36px;text-align:center">
    <div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px">YouGouYou 🇬🇳</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px">Le marché de toute la Guinée</div>
  </td></tr>
  <tr><td style="padding:32px 36px">
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a1a">Réinitialisation de mot de passe</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#333">Bonjour <strong>${user.prenom}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.6">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en créer un nouveau.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 28px">
      <a href="${resetUrl}" style="display:inline-block;background:#FF5C00;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
        🔒 Réinitialiser mon mot de passe
      </a>
    </td></tr></table>
    <p style="margin:0 0 8px;font-size:13px;color:#999">Ou copiez ce lien dans votre navigateur :</p>
    <p style="margin:0 0 24px;font-size:12px;color:#FF5C00;word-break:break-all">${resetUrl}</p>
    <div style="background:#fff8f0;border-left:4px solid #FF5C00;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px">
      <p style="margin:0;font-size:12px;color:#666">⏱️ Ce lien expire dans <strong>1 heure</strong>.<br>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    </div>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:16px 36px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;font-size:12px;color:#aaa">© ${new Date().getFullYear()} YouGouYou · Conakry, Guinée</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
      console.log(`[RESET] Envoi lien reset à ${email} — URL: ${resetUrl}`);
      await sendEmail(email, 'Réinitialisez votre mot de passe YouGouYou', htmlBody, textBody);
    }
    res.json({ success: true, message: 'Email envoyé si le compte existe' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Reset mot de passe — étape 2 : changer le mot de passe
app.post('/api/auth/reset-password/confirm', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });

    const resetDoc = await ResetToken.findOne({ token, used: false });
    if (!resetDoc || new Date() > resetDoc.expiresAt)
      return res.status(400).json({ error: 'Token invalide ou expiré' });

    const hashed = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(resetDoc.userId, { password: hashed });
    await ResetToken.findByIdAndUpdate(resetDoc._id, { used: true });
    res.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  UTILISATEURS
// ═══════════════════════════════════════════════════════════

// Profil connecté
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -verifyCode -codeExpiry');
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    res.json({ user: {
      id: user._id, name: `${user.prenom} ${user.nom||''}`.trim(),
      prenom: user.prenom, nom: user.nom, phone: user.phone,
      email: user.email, city: user.city,
      role: user.role,        // toujours depuis MongoDB (source de vérité)
      verified: user.verified,
      isPro: user.isPro && user.proUntil && user.proUntil > new Date() ? true : false,
      proUntil: user.proUntil || null,
      avgRating: user.avgRating, ratingCount: user.ratingCount,
    }});
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Modifier son profil
app.patch('/api/me', auth, async (req, res) => {
  try {
    const { prenom, nom, city, email, dob, pob } = req.body;
    const update = {};
    if (prenom) update.prenom = prenom;
    if (nom !== undefined) update.nom = nom;
    if (city)  update.city  = city;
    if (email) update.email = email.toLowerCase();
    if (dob)   update.dob   = dob;
    if (pob)   update.pob   = pob;
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Profil public d'un vendeur
app.get('/api/users/:id/public', authOptional, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('prenom nom city isPro proUntil avgRating ratingCount totalViews createdAt verified ' +
              'boutiqueDesc boutiqueSlogan boutiqueBanner boutiqueSector boutiqueHours boutiqueSocial boutiquePinned boutiqueItems');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const isProActive = user.isPro && user.proUntil && user.proUntil > new Date();
    const adsCount = await Ad.countDocuments({ seller: user._id, active: true });

    // Annonces épinglées (jusqu'à 3)
    let pinnedAds = [];
    if (isProActive && user.boutiquePinned?.length) {
      pinnedAds = await Ad.find({ _id: { $in: user.boutiquePinned }, active: true })
        .select('title price city photos emoji category subCategory views createdAt').limit(3);
    }

    // Avis clients
    const reviews = await Review.find({ sellerId: user._id })
      .sort({ createdAt: -1 }).limit(10)
      .select('reviewerName rating comment createdAt vendorReply');

    res.json({
      _id: user._id,
      firstName: user.prenom,
      name: `${user.prenom} ${user.nom||''}`.trim(),
      city: user.city,
      isPro: isProActive,
      verified: user.verified || false,
      memberSince: user.createdAt?.getFullYear() || new Date().getFullYear(),
      totalViews: user.totalViews || 0,
      rating: { avg: user.avgRating || 0, count: user.ratingCount || 0 },
      adsCount,
      reviews,
      pinnedAds,
      // Boutique
      boutiqueName:    user.boutiqueName    || '',
      boutiqueDesc:    user.boutiqueDesc    || '',
      boutiqueSlogan:  user.boutiqueSlogan  || '',
      boutiqueBanner:  user.boutiqueBanner  || '',
      boutiqueSector:  user.boutiqueSector  || '',
      boutiqueHours:   user.boutiqueHours   || {},
      boutiqueSocial:  user.boutiqueSocial  || {},
      boutiqueItems:   isProActive ? (user.boutiqueItems || []) : [],
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Stats du vendeur connecté

// ★ Liste des boutiques Pro publiques
app.get('/api/boutiques', async (req, res) => {
  try {
    const now = new Date();
    const { sector, search, limit = 50 } = req.query;
    const filter = {
      isPro: true,
      proUntil: { $gt: now },
    };
    if (sector) filter.boutiqueSector = sector;
    if (search) filter.$or = [
      { boutiqueName:  new RegExp(search, 'i') },
      { boutiqueDesc:  new RegExp(search, 'i') },
      { boutiqueSector:new RegExp(search, 'i') },
    ];

    const users = await User.find(filter)
      .select('prenom nom city boutiqueName boutiqueSlogan boutiqueBanner boutiqueSector boutiqueSocial boutiqueDesc avgRating ratingCount totalViews createdAt')
      .sort({ totalViews: -1 })
      .limit(Number(limit))
      .lean();

    // Ajouter le nombre d'annonces pour chaque boutique
    const boutiques = await Promise.all(users.map(async (u) => {
      const adsCount = await Ad.countDocuments({ seller: u._id, active: true });
      return { ...u, adsCount };
    }));

    res.json({ boutiques, total: boutiques.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/my-stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('avgRating ratingCount totalViews isPro proUntil');
    const ads  = await Ad.find({ seller: req.user.id, active: true }).select('views');
    const totalViews    = ads.reduce((acc, a) => acc + (a.views||0), 0);
    const totalContacts = await Payment.countDocuments({ type: 'commission', buyer: req.user.id });
    const recentAds     = ads.length;
    // Vérifier expiration Pro
    const now = new Date();
    let isPro = user?.isPro || false;
    if (isPro && user.proUntil && user.proUntil < now) {
      await User.findByIdAndUpdate(req.user.id, { isPro: false });
      isPro = false;
    }
    res.json({
      totalViews, totalContacts, recentAds,
      avgRating:   user?.avgRating || 0,
      ratingCount: user?.ratingCount || 0,
      isPro,
      proUntil: user?.proUntil || null,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ANNONCES
// ═══════════════════════════════════════════════════════════

// Lister les annonces (public)
app.get('/api/ads', async (req, res) => {
  try {
    const { category, city, minPrice, maxPrice, q, seller,
            sort = 'date_desc', etat, limit = 50, skip = 0, page } = req.query;

    const filter = { active: true };
    if (category) filter.category = category;
    if (city)     filter.city = new RegExp(city, 'i');
    if (etat)     filter.etat = etat;
    if (seller)   filter.seller = seller;
    if (q)        filter.$text = { $search: q };   // full-text index
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Désactiver vedette et urgent expirés au fil de l'eau
    const now = new Date();
    await Ad.updateMany({ featuredUntil: { $lt: now }, featured: true }, { featured: false, featuredUntil: null });
    await Ad.updateMany({ urgentUntil:   { $lt: now }, urgentBadge: true }, { urgentBadge: false, urgentUntil: null });

    const sortMap = {
      date_desc:  { createdAt: -1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      views_desc: { views: -1 },
      boosted:    { boostedAt: -1, createdAt: -1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const realSkip = page ? (Number(page) - 1) * Number(limit) : Number(skip);
    const ads = await Ad.find(filter)
      .sort(sortObj).skip(realSkip).limit(Number(limit))
      .select('-sellerPhone')
      .populate('seller', 'prenom nom phone city avgRating ratingCount verified');
    const total = await Ad.countDocuments(filter);
    // Enrichir sellerName depuis le User populé
    const adsOut = ads.map(a => {
      const obj = a.toObject();
      if (a.seller && typeof a.seller === 'object') {
        obj.sellerName  = (`${a.seller.prenom||''} ${a.seller.nom||''}`).trim() || obj.sellerName || 'Vendeur';
        obj.sellerPhone = a.seller.phone || '';
        obj.seller      = a.seller._id;
      } else {
        obj.sellerName  = obj.sellerName || 'Vendeur';
      }
      return obj;
    });
    res.json({ ads: adsOut, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Détail d'une annonce
app.get('/api/ads/:id', authOptional, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('-sellerPhone')
     .populate('seller', 'prenom nom phone city avgRating ratingCount verified isPro');
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });
    const adOut = ad.toObject();
    if (ad.seller && typeof ad.seller === 'object') {
      adOut.sellerName  = (`${ad.seller.prenom||''} ${ad.seller.nom||''}`).trim() || adOut.sellerName || 'Vendeur';
      adOut.sellerPhone = ad.seller.phone || '';
      adOut.seller      = ad.seller._id;
    } else {
      adOut.sellerName  = adOut.sellerName || 'Vendeur';
    }

    // Incrémenter totalViews du vendeur
    if (ad.seller) User.findByIdAndUpdate(ad.seller, { $inc: { totalViews: 1 } }).catch(()=>{});

    // Ajouter la note du vendeur à la réponse
    let sellerRating = null;
    if (ad.seller) {
      const seller = await User.findById(ad.seller).select('avgRating ratingCount isPro');
      if (seller) sellerRating = { avg: seller.avgRating, count: seller.ratingCount, isPro: seller.isPro };
    }

    res.json({ ...adOut, sellerRating });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Publier une annonce
app.post('/api/ads', auth, async (req, res) => {
  try {
    const { title, description, price, category, subCategory, subItem,
            city, quartier, etat,
            phone, photos, seller: sellerName, nego, subFields, tags } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Titre et prix obligatoires' });

    const ad = await Ad.create({
      title, description, price: Number(price),
      category, subCategory: subCategory||'', subItem: subItem||'',
      city, quartier, etat,
      sellerName: sellerName || req.user.prenom || '',
      sellerPhone: phone || '',
      seller: req.user.id,
      photos: Array.isArray(photos) ? photos.slice(0,8) : [],
      nego: Boolean(nego),
      subFields: subFields || {},
      tags: Array.isArray(tags) ? tags : [],
      active: true,
    });

    // Notifier les alertes correspondantes (asynchrone — ne bloque pas la réponse)
    triggerAlerts(ad).catch(err => console.error('[ALERTS]', err.message));

    res.json({ success: true, ad });
  } catch(err) {
    console.error('POST /api/ads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Modifier une annonce
app.patch('/api/ads/:id', auth, async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Introuvable' });
    if (String(ad.seller) !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Non autorisé' });

    const allowed = ['title','description','price','category','subCategory','subItem',
                     'city','quartier','etat','photos','nego','subFields','tags'];
    allowed.forEach(k => { if (req.body[k] !== undefined) ad[k] = req.body[k]; });
    if (req.body.phone) ad.sellerPhone = req.body.phone;
    await ad.save();
    res.json({ success: true, ad });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Supprimer une annonce
app.delete('/api/ads/:id', auth, async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Introuvable' });
    if (String(ad.seller) !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Non autorisé' });
    await ad.deleteOne();
    // Nettoyer les conversations liées
    await Conversation.deleteMany({ adId: req.params.id });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Mes annonces
app.get('/api/my-ads', auth, async (req, res) => {
  try {
    const ads = await Ad.find({ seller: req.user.id }).sort({ createdAt: -1 });
    res.json(ads);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ★ FAVORIS
// ═══════════════════════════════════════════════════════════

// Lister mes favoris
app.get('/api/me/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const favIds = user.favorites || [];
    const ads = await Ad.find({ _id: { $in: favIds }, active: true })
      .select('-sellerPhone')
      .populate('seller', 'prenom nom city avgRating verified');
    res.json({ favorites: favIds.map(String), ads });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ajouter / retirer un favori (toggle)
app.post('/api/me/favorites/:adId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('favorites');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const adId = req.params.adId;
    const favs = (user.favorites || []).map(String);
    const idx  = favs.indexOf(adId);
    let action;

    if (idx >= 0) {
      // Retirer
      await User.findByIdAndUpdate(req.user.id, { $pull: { favorites: adId } });
      action = 'removed';
    } else {
      // Ajouter (max 200 favoris)
      if (favs.length >= 200) return res.status(400).json({ error: 'Maximum 200 favoris' });
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { favorites: adId } });
      action = 'added';
    }
    // Retourner la liste à jour
    const updated = await User.findById(req.user.id).select('favorites');
    res.json({ success: true, action, favorites: (updated.favorites || []).map(String) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Boost / Mise en avant d'une annonce
app.post('/api/ads/:id/boost', auth, async (req, res) => {
  try {
    const { type = 'boost', phone } = req.body;
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });
    if (String(ad.seller) !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Non autorisé' });

    const now = new Date();
    const prices = { feature: 10000, boost: 5000, urgent: 3000, whatsapp: 2000 };
    const amount = prices[type] || 5000;

    if (type === 'feature') {
      ad.featured    = true;
      ad.featuredUntil = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 7 jours
    } else if (type === 'boost') {
      ad.boostedAt   = now;                             // remonte l'annonce
    } else if (type === 'urgent') {
      ad.urgentBadge = true;
      ad.urgentUntil = new Date(now.getTime() + 3 * 24 * 3600 * 1000); // 3 jours
    }
    await ad.save();

    const ref = genRef();
    await Payment.create({
      type: 'boost', buyer: req.user.id, buyerPhone: phone,
      ad: ad._id, adTitle: ad.title,
      amount, boostType: type, reference: ref, status: 'success'
    });

    res.json({ success: true, reference: ref, type, amount, ad });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ★ MESSAGERIE INTERNE
// ═══════════════════════════════════════════════════════════

// Lister mes conversations (acheteur ou vendeur)
app.get('/api/conversations', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const convs = await Conversation.find({
      $or: [{ buyerId: uid }, { sellerId: uid }]
    }).sort({ updatedAt: -1 }).limit(50).select('-messages');

    // Ajouter unreadCount selon le rôle de l'utilisateur
    const result = convs.map(c => {
      const isbuyer = String(c.buyerId) === uid;
      return {
        ...c.toObject(),
        unreadCount: isbuyer ? c.unreadBuyer : c.unreadSeller,
      };
    });
    res.json({ conversations: result });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Démarrer ou récupérer une conversation (depuis page détail annonce)
app.post('/api/conversations', auth, async (req, res) => {
  try {
    const { adId, message, initContact } = req.body;

    // initContact = true  → ouverture via bouton "Contacter le vendeur 3%"
    //               (pas de message user obligatoire, message système auto injecté)
    // message     = texte → ancien flux (compatibilité)
    if (!adId) return res.status(400).json({ error: 'adId requis' });
    if (!initContact && !message) return res.status(400).json({ error: 'adId et message requis' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    if (String(ad.seller) === req.user.id)
      return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message' });

    const buyer  = await User.findById(req.user.id).select('prenom nom');
    const seller = await User.findById(ad.seller).select('prenom nom');

    // Trouver ou créer la conversation unique (adId + buyerId)
    let conv = await Conversation.findOne({ adId, buyerId: req.user.id });
    const isNew = !conv;

    if (!conv) {
      conv = await Conversation.create({
        adId, adTitle: ad.title,
        buyerId:    req.user.id,
        buyerName:  `${buyer?.prenom||''} ${buyer?.nom||''}`.trim(),
        sellerId:   ad.seller,
        sellerName: `${seller?.prenom||''} ${seller?.nom||''}`.trim(),
        messages:   [],
        unreadBuyer: 0, unreadSeller: 0,
      });
    }

    // ── Message système automatique (frais 3%) ──────────────────
    // Injecté uniquement à la création d'une nouvelle conversation via "Contacter le vendeur"
    if (isNew) {
      const sysText = 'Des frais de mise en relation de 3% s\'appliquent pour contacter ce vendeur via YouGouYou.';
      conv.messages.push({
        senderId:  ad.seller,   // senderId = vendeur (ObjectId valide), isSystem=true pour le distinguer
        text:      sysText,
        isSystem:  true,
        createdAt: new Date(),
        read:      true,        // jamais compté dans les non-lus
      });
      conv.lastMessage = sysText.substring(0, 100);
      conv.updatedAt   = new Date();
    }

    // ── Message de l'utilisateur (si fourni) ────────────────────
    if (message && message.trim()) {
      const msgText = message.trim();
      conv.messages.push({ senderId: req.user.id, text: msgText });
      conv.lastMessage  = msgText.substring(0, 100);
      conv.updatedAt    = new Date();
      conv.unreadSeller += 1;
    }

    await conv.save();

    // Incrémenter contacts du vendeur (uniquement si nouvelle conv)
    if (isNew) {
      User.findByIdAndUpdate(ad.seller, { $inc: { totalContacts: 1 } }).catch(()=>{});
    }

    res.json({ success: true, conversationId: conv._id });
  } catch(err) {
    // Gérer la violation d'unicité (race condition)
    if (err.code === 11000) {
      const conv = await Conversation.findOne({ adId: req.body.adId, buyerId: req.user.id });
      return res.json({ success: true, conversationId: conv?._id });
    }
    res.status(500).json({ error: err.message });
  }
});

// Total messages non lus  ← DOIT être avant /:id pour éviter le conflit Express
app.get('/api/conversations/unread', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const asBuyer  = await Conversation.aggregate([
      { $match: { buyerId: new mongoose.Types.ObjectId(uid) } },
      { $group: { _id: null, total: { $sum: '$unreadBuyer' } } }
    ]);
    const asSeller = await Conversation.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(uid) } },
      { $group: { _id: null, total: { $sum: '$unreadSeller' } } }
    ]);
    const count = (asBuyer[0]?.total||0) + (asSeller[0]?.total||0);
    res.json({ count });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Lire les messages d'une conversation
app.get('/api/conversations/:id', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const uid = req.user.id;
    if (String(conv.buyerId) !== uid && String(conv.sellerId) !== uid)
      return res.status(403).json({ error: 'Accès refusé' });

    res.json({ conversation: conv, messages: conv.messages });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Envoyer un message dans une conversation
app.post('/api/conversations/:id', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message vide' });

    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const uid = req.user.id;
    if (String(conv.buyerId) !== uid && String(conv.sellerId) !== uid)
      return res.status(403).json({ error: 'Accès refusé' });

    const isBuyer = String(conv.buyerId) === uid;
    conv.messages.push({ senderId: uid, text: text.trim() });
    conv.lastMessage = text.substring(0,100);
    conv.updatedAt   = new Date();
    if (isBuyer)  conv.unreadSeller += 1;
    else          conv.unreadBuyer  += 1;
    await conv.save();

    // Renvoyer uniquement le dernier message (optimisation)
    const last = conv.messages[conv.messages.length - 1];
    res.json({ success: true, message: last });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Marquer une conversation comme lue
app.patch('/api/conversations/:id/read', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Introuvable' });

    const uid = req.user.id;
    if (String(conv.buyerId) === uid) {
      conv.unreadBuyer = 0;
      conv.messages.forEach(m => {
        if (String(m.senderId) !== uid) m.read = true;
      });
    } else if (String(conv.sellerId) === uid) {
      conv.unreadSeller = 0;
      conv.messages.forEach(m => {
        if (String(m.senderId) !== uid) m.read = true;
      });
    }
    await conv.save();
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ★ AVIS / NOTATION VENDEURS
// ═══════════════════════════════════════════════════════════

// Laisser un avis
app.post('/api/reviews', auth, async (req, res) => {
  try {
    const { sellerId, adId, rating, comment } = req.body;
    if (!sellerId || !rating) return res.status(400).json({ error: 'sellerId et rating requis' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });
    if (sellerId === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous noter' });

    const buyer = await User.findById(req.user.id).select('prenom nom');

    // Upsert : on met à jour si l'avis existe déjà
    const review = await Review.findOneAndUpdate(
      { reviewerId: req.user.id, sellerId },
      { rating, comment: comment || '', reviewerName: `${buyer?.prenom||''} ${buyer?.nom||''}`.trim(),
        adId: adId || null, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // Recalculer la moyenne
    await recalcSellerRating(sellerId);

    res.json({ success: true, review });
  } catch(err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Vous avez déjà noté ce vendeur' });
    res.status(500).json({ error: err.message });
  }
});

// Résumé des avis d'un vendeur

// Répondre à un avis (vendeur uniquement)
app.patch('/api/reviews/:id/reply', auth, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) return res.status(400).json({ error: 'Réponse requise' });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Avis introuvable' });
    // Seul le vendeur concerné peut répondre
    if (String(review.sellerId) !== req.user.id)
      return res.status(403).json({ error: 'Non autorisé' });
    await Review.findByIdAndUpdate(req.params.id, {
      vendorReply: reply.trim(),
      vendorReplyAt: new Date(),
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/reviews/:sellerId/summary', async (req, res) => {
  try {
    const result = await Review.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(req.params.sellerId) } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 },
          dist: { $push: '$rating' } } }
    ]);
    if (!result.length) return res.json({ avg: 0, count: 0, distribution: {} });

    // Distribution des notes 1-5
    const dist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
    result[0].dist.forEach(r => { dist[r] = (dist[r]||0)+1; });

    res.json({
      avg:   Math.round(result[0].avg * 10) / 10,
      count: result[0].count,
      distribution: dist,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Derniers avis d'un vendeur
app.get('/api/reviews/:sellerId', async (req, res) => {
  try {
    const { limit = 10, skip = 0 } = req.query;
    const reviews = await Review.find({ sellerId: req.params.sellerId })
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .select('reviewerName rating comment createdAt');
    const total = await Review.countDocuments({ sellerId: req.params.sellerId });
    res.json({ reviews, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ★ ALERTES DE RECHERCHE
// ═══════════════════════════════════════════════════════════

// Créer une alerte
app.post('/api/alerts', auth, async (req, res) => {
  try {
    const { query, category, city, priceMin, priceMax } = req.body;
    if (!query && !category) return res.status(400).json({ error: 'Au moins un critère requis' });

    // Limiter à 5 alertes par utilisateur
    const count = await Alert.countDocuments({ userId: req.user.id, active: true });
    if (count >= 5) return res.status(400).json({ error: 'Maximum 5 alertes actives' });

    const alert = await Alert.create({
      userId: req.user.id,
      query: query || '',
      category: category || '',
      city: city || '',
      priceMin: Number(priceMin) || 0,
      priceMax: Number(priceMax) || 0,
    });
    res.json({ success: true, alert });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Mes alertes
app.get('/api/alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user.id, active: true }).sort({ createdAt: -1 });
    res.json({ alerts });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Supprimer une alerte
app.delete('/api/alerts/:id', auth, async (req, res) => {
  try {
    const alert = await Alert.findOne({ _id: req.params.id, userId: req.user.id });
    if (!alert) return res.status(404).json({ error: 'Alerte introuvable' });
    alert.active = false;
    await alert.save();
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Déclencheur d'alertes (appelé lors de la création d'une annonce)
async function triggerAlerts(ad) {
  const alerts = await Alert.find({ active: true });
  for (const alert of alerts) {
    try {
      let match = true;
      if (alert.query) {
        const q = alert.query.toLowerCase();
        const inTitle = (ad.title||'').toLowerCase().includes(q);
        const inDesc  = (ad.description||'').toLowerCase().includes(q);
        if (!inTitle && !inDesc) match = false;
      }
      if (alert.category && ad.category !== alert.category) match = false;
      if (alert.city && !(ad.city||'').toLowerCase().includes(alert.city.toLowerCase())) match = false;
      if (alert.priceMin > 0 && ad.price < alert.priceMin) match = false;
      if (alert.priceMax > 0 && ad.price > alert.priceMax) match = false;

      if (!match) continue;

      // Anti-spam : ne notifier qu'une fois par heure par alerte
      if (alert.lastSentAt && (Date.now() - alert.lastSentAt.getTime()) < 3600000) continue;

      const user = await User.findById(alert.userId).select('email prenom');
      if (!user?.email) continue;

      await sendEmail(
        user.email,
        `🔔 Nouvelle annonce : ${ad.title} — YouGouYou`,
        emailAlertHTML(alert, ad),
        `Nouvelle annonce correspondant à votre alerte : ${ad.title} — ${ad.price} GNF`
      );

      alert.lastSentAt = new Date();
      await alert.save();
      console.log(`[ALERT] Email envoyé à ${user.email} pour alerte #${alert._id}`);
    } catch(e) {
      console.error('[ALERT] Erreur:', e.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  ★ SIGNALEMENTS
// ═══════════════════════════════════════════════════════════

// Signaler une annonce
app.post('/api/reports', authOptional, async (req, res) => {
  try {
    const { adId, reason, details } = req.body;
    if (!adId || !reason) return res.status(400).json({ error: 'adId et reason requis' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    // Anti-spam : 1 signalement par (IP ou user) par annonce
    const filter = { adId };
    if (req.user?.id) filter.reporterId = req.user.id;
    const existing = await Report.findOne(filter);
    if (existing) return res.status(400).json({ error: 'Vous avez déjà signalé cette annonce' });

    const report = await Report.create({
      reporterId: req.user?.id || null,
      adId, reason,
      details: details || '',
    });

    // Si > 5 signalements, désactiver automatiquement l'annonce
    const reportCount = await Report.countDocuments({ adId, status: 'pending' });
    if (reportCount >= 5) {
      await Ad.findByIdAndUpdate(adId, { active: false });
      console.log(`[REPORT] Annonce ${adId} désactivée automatiquement (${reportCount} signalements)`);
    }

    res.json({ success: true, report: { _id: report._id } });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  PAIEMENTS
// ═══════════════════════════════════════════════════════════

// Paiement Orange Money standard
app.post('/api/payment/orange-money', auth, async (req, res) => {
  try {
    const { adId, buyerPhone, pin } = req.body;
    if (!adId || !buyerPhone) return res.status(400).json({ error: 'Données manquantes' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    // En prod : appeler l'API Orange Money Guinée
    const ref = genRef();
    await Payment.create({
      type: 'purchase', buyer: req.user.id, buyerPhone,
      ad: ad._id, adTitle: ad.title,
      amount: ad.price, reference: ref, status: 'success'
    });
    res.json({ success: true, reference: ref, amount: ad.price });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Commission 5% pour révéler le numéro — avec tentative Orange Money API
app.post('/api/payment/commission', auth, async (req, res) => {
  try {
    const { adId, buyerPhone, pin, phone } = req.body;
    const payerPhone = buyerPhone || phone;
    if (!adId || !payerPhone) return res.status(400).json({ error: 'Données manquantes' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    const commission = Math.max(Math.round(ad.price * 0.05), 1000);
    const ref = genRef();

    // ── Tentative paiement Orange Money Guinée ──────────────────
    // L'API Orange Money Guinée n'est pas encore disponible publiquement.
    // En attendant l'accès API officiel, on enregistre le paiement
    // et on révèle le numéro (le vendeur recevra la commission manuellement).
    // 
    // Quand vous aurez accès à l'API OM Guinée, remplacez ce bloc par :
    // const omResult = await callOrangeMoney(payerPhone, pin, commission, ref);
    // if (!omResult.success) return res.status(402).json({ error: omResult.message });
    // ─────────────────────────────────────────────────────────────

    console.log(`[PAYMENT] Commission ${commission} GNF | ref=${ref} | payer=${payerPhone} | ad=${adId}`);

    // Enregistrer le paiement
    const payment = await Payment.create({
      type: 'commission',
      buyer: req.user.id,
      buyerPhone: payerPhone,
      ad: ad._id,
      adTitle: ad.title,
      amount: commission,
      commission,
      reference: ref,
      status: 'success'
    });

    // Incrémenter contacts du vendeur
    User.findByIdAndUpdate(ad.seller, { $inc: { totalContacts: 1 } }).catch(()=>{});

    // Récupérer le vrai numéro du vendeur
    const seller = await User.findById(ad.seller).select('phone');
    const sellerPhone = ad.sellerPhone || (seller && seller.phone) || '';

    console.log(`[PAYMENT] ✅ Commission ref=${ref} — numéro révélé: ${sellerPhone}`);

    res.json({
      success: true,
      reference: ref,
      commission,
      sellerPhone,
      message: 'Paiement enregistré — numéro révélé'
    });
  } catch(err) {
    console.error('[PAYMENT] Erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Mes paiements
app.get('/api/my-payments', auth, async (req, res) => {
  try {
    const pays = await Payment.find({ buyer: req.user.id }).sort({ createdAt: -1 });
    res.json(pays);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════

// Stats globales
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const now       = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart= new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [totalUsers, totalAds, totalConvs, totalReports,
           totalPayments, revenueResult,
           proUsers,
           payToday, payMonth, payYear] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ active: true }),
      Conversation.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      Payment.countDocuments(),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      User.countDocuments({ isPro: true, proUntil: { $gt: now } }),
      Payment.aggregate([{ $match: { createdAt:{$gte:today}    }}, { $group:{_id:null,total:{$sum:'$amount'}}}]),
      Payment.aggregate([{ $match: { createdAt:{$gte:monthStart}}}, { $group:{_id:null,total:{$sum:'$amount'}}}]),
      Payment.aggregate([{ $match: { createdAt:{$gte:yearStart} }}, { $group:{_id:null,total:{$sum:'$amount'}}}]),
    ]);

    res.json({
      totalUsers, totalAds, totalPayments,
      revenue:       revenueResult[0]?.total || 0,
      totalConvs,
      pendingReports: totalReports,
      proUsers,
      // Paiements par période
      revenueToday:  payToday[0]?.total  || 0,
      revenueMonth:  payMonth[0]?.total  || 0,
      revenueYear:   payYear[0]?.total   || 0,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats/period', auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const periods = {
      day:   new Date(now - 24*3600*1000),
      week:  new Date(now - 7*24*3600*1000),
      month: new Date(now - 30*24*3600*1000),
    };
    const results = {};
    for (const [k, since] of Object.entries(periods)) {
      const [ads, users, payments] = await Promise.all([
        Ad.countDocuments({ createdAt: { $gte: since } }),
        User.countDocuments({ createdAt: { $gte: since } }),
        Payment.aggregate([
          { $match: { status: 'success', createdAt: { $gte: since } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ])
      ]);
      results[k] = { ads, users, revenue: payments[0]?.total||0, payments: payments[0]?.count||0 };
    }
    res.json(results);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Utilisateurs
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0, search } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { prenom: new RegExp(search, 'i') }, { nom: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },  { city: new RegExp(search, 'i') },
    ];
    const users = await User.find(filter)
      .select('-password -verifyCode -codeExpiry -smsCode')
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();
    const total = await User.countDocuments(filter);
    res.json({ users, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    const [ads, pays] = await Promise.all([
      Ad.find({ seller: user._id }).sort({ createdAt: -1 }),
      Payment.find({ buyer: user._id }).sort({ createdAt: -1 })
    ]);
    res.json({ user, ads, payments: pays });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/users/:id/role', auth, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Admin — activer/retirer le Pro d'un utilisateur
app.patch('/api/admin/users/:id/pro', auth, adminOnly, async (req, res) => {
  try {
    const { isPro, months } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (!isPro) {
      // Retirer le Pro
      await User.findByIdAndUpdate(req.params.id, { isPro: false, proUntil: null });
      console.log(`[ADMIN PRO] Retiré → ${req.params.id}`);
      return res.json({ success: true, isPro: false });
    }

    // Activer le Pro
    const validMonths = [1, 3, 12];
    const m = validMonths.includes(Number(months)) ? Number(months) : 1;
    const now = new Date();
    const base = (user.isPro && user.proUntil && user.proUntil > now) ? user.proUntil : now;
    const proUntil = new Date(base);
    proUntil.setMonth(proUntil.getMonth() + m);

    await User.findByIdAndUpdate(req.params.id, { isPro: true, proUntil });

    // Email de notification à l'utilisateur
    if (user.email && user.email.includes('@')) {
      const expiryStr = proUntil.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#FF5C00,#FF9500);padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">⭐ Votre compte est maintenant Pro !</h2>
        </div>
        <div style="padding:20px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px">
          <p>Bonjour <strong>${user.prenom}</strong>,</p>
          <p>L'équipe YouGouYou vous a offert un abonnement <strong>Pro de ${m} mois</strong>.</p>
          <p>Votre abonnement est actif jusqu'au <strong>${expiryStr}</strong>.</p>
          <a href="https://yougouyougou.net" style="display:inline-block;background:#FF5C00;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:10px">Voir mon compte Pro →</a>
        </div>
      </div>`;
      sendEmail(user.email, '⭐ Votre compte YouGouYou est maintenant Pro !', html,
        `Bonjour ${user.prenom}, votre abonnement Pro ${m} mois est actif jusqu'au ${expiryStr}.`)
        .catch(e => console.error('[ADMIN PRO EMAIL]', e.message));
    }

    console.log(`[ADMIN PRO] Activé → ${req.params.id} (${m} mois, expire: ${proUntil.toISOString()})`);
    res.json({ success: true, isPro: true, proUntil: proUntil.toISOString(), months: m });
  } catch(err) {
    console.error('[ADMIN PRO]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Ad.deleteMany({ seller: req.params.id });
    await Conversation.deleteMany({ $or: [{ buyerId: req.params.id }, { sellerId: req.params.id }] });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Annonces admin
app.get('/api/admin/ads', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0, category, status } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status === 'active')   filter.active = true;
    if (status === 'inactive') filter.active = false;
    const ads   = await Ad.find(filter).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit));
    const total = await Ad.countDocuments(filter);
    res.json({ ads, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/ads/:id', auth, adminOnly, async (req, res) => {
  try {
    await Ad.findByIdAndDelete(req.params.id);
    await Conversation.deleteMany({ adId: req.params.id });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/ads/:id/feature', auth, adminOnly, async (req, res) => {
  try {
    const { featured } = req.body;
    const update = { featured };
    if (featured) update.featuredUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 jours admin
    const ad = await Ad.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ success: true, ad });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Signalements admin
app.get('/api/admin/reports', auth, adminOnly, async (req, res) => {
  try {
    const { status = 'pending', limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit))
      .populate('adId', 'title city category')
      .populate('reporterId', 'prenom nom');
    const total = await Report.countDocuments(filter);
    res.json({ reports, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/reports/:id', auth, adminOnly, async (req, res) => {
  try {
    const { status, action } = req.body; // action: 'dismiss' | 'remove_ad'
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    if (action === 'remove_ad') {
      await Ad.findByIdAndUpdate(report.adId, { active: false });
      await Report.updateMany({ adId: report.adId }, { status: 'reviewed' });
    }
    res.json({ success: true, report });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ★ Avis admin
app.get('/api/admin/reviews', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const reviews = await Review.find()
      .sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit))
      .populate('sellerId', 'prenom nom')
      .populate('reviewerId', 'prenom nom');
    const total = await Review.countDocuments();
    res.json({ reviews, total });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/reviews/:id', auth, adminOnly, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (review) await recalcSellerRating(review.sellerId);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Paiements admin
app.get('/api/admin/payments', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0, type } = req.query;
    const filter = {};
    if (type) filter.type = type;
    const pays = await Payment.find(filter)
      .sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit))
      .populate('buyer', 'prenom nom phone')
      .populate('ad', 'title price');
    const total   = await Payment.countDocuments(filter);
    const revenue = await Payment.aggregate([
      { $match: { status: 'success', ...filter } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    res.json({ payments: pays, total, revenue: revenue[0]?.total || 0 });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Activer/désactiver un compte pro (admin)
app.patch('/api/admin/users/:id/pro', auth, adminOnly, async (req, res) => {
  try {
    const { isPro, months = 1 } = req.body;
    const update = { isPro };
    if (isPro) update.proUntil = new Date(Date.now() + months * 30 * 24 * 3600 * 1000);
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Route contact ─────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'Nom et message requis' });
    if (!email && !phone)  return res.status(400).json({ error: 'Email ou téléphone requis' });

    const contactEmail = process.env.EMAIL_FROM || 'noreply@yougouyougou.net';
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#FF5C00;padding:20px;border-radius:10px 10px 0 0;text-align:center">
    <h2 style="color:#fff;margin:0">📩 Nouveau message de contact</h2>
    <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px">YouGouYou.net</p>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 10px 10px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;font-weight:700;width:120px;color:#555">Nom</td><td style="padding:8px 0">${name}</td></tr>
      <tr><td style="padding:8px 0;font-weight:700;color:#555">Email</td><td style="padding:8px 0">${email||'—'}</td></tr>
      <tr><td style="padding:8px 0;font-weight:700;color:#555">Téléphone</td><td style="padding:8px 0">${phone||'—'}</td></tr>
      <tr><td style="padding:8px 0;font-weight:700;color:#555">Sujet</td><td style="padding:8px 0">${subject||'—'}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <div style="font-weight:700;margin-bottom:8px;color:#333">Message :</div>
    <div style="background:#f9f9f9;padding:14px;border-radius:8px;font-size:14px;line-height:1.7;color:#333">${message.replace(/\n/g,'<br>')}</div>
    <div style="margin-top:16px;font-size:12px;color:#aaa">Reçu le ${new Date().toLocaleString('fr-FR')} — YouGouYou.net</div>
  </div>
</body></html>`;

    const text = `Nouveau message de ${name}\nEmail: ${email||'—'}\nTél: ${phone||'—'}\nSujet: ${subject||'—'}\n\n${message}`;

    // Envoyer à l'adresse support
    await sendEmail('support.yougouyougou@gmail.com',
      `[Contact YouGouYou] ${subject||'Nouveau message'} — ${name}`,
      html, text
    );

    // Envoyer confirmation à l'expéditeur si email fourni
    if (email) {
      const confirmHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#FF5C00;padding:20px;border-radius:10px 10px 0 0;text-align:center">
    <div style="font-size:28px">✅</div>
    <h2 style="color:#fff;margin:4px 0 0">Message bien reçu !</h2>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 10px 10px">
    <p>Bonjour <strong>${name}</strong>,</p>
    <p style="line-height:1.7">Nous avons bien reçu votre message et nous vous répondrons dans les <strong>24 heures ouvrées</strong>.</p>
    <div style="background:#FFF3EE;border-radius:8px;padding:12px;margin:16px 0;font-size:13px;color:#555">
      <strong>Votre message :</strong><br>${message.replace(/\n/g,'<br>')}
    </div>
    <p style="font-size:13px;color:#888">— L'équipe YouGouYou 🇬🇳</p>
  </div>
</body></html>`;
      await sendEmail(email, 'Votre message a bien été reçu — YouGouYou', confirmHtml,
        `Bonjour ${name}, votre message a bien été reçu. Nous vous répondrons sous 24h.`
      );
    }

    console.log(`[CONTACT] Message de ${name} (${email||phone}) — sujet: ${subject||'—'}`);
    res.json({ success: true, message: 'Message envoyé avec succès' });
  } catch(err) {
    console.error('[CONTACT] Erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════
//  HEALTH CHECK + SPA FALLBACK
// ═══════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'YouGouYou API',
    version: '3.0.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    features: ['messaging','reviews','alerts','reports','boost','pro'],
  });
});


// ★ Abonnement Pro — souscrire
app.post('/api/subscribe-pro', auth, async (req, res) => {
  try {
    const { planId, months, amount, phone } = req.body;

    const plans = {
      '1m':  { months: 1,  amount: 50000  },
      '3m':  { months: 3,  amount: 120000 },
      '12m': { months: 12, amount: 400000 },
    };
    const plan = plans[planId];
    if (!plan)  return res.status(400).json({ error: 'Plan invalide (1m, 3m ou 12m)' });
    if (!phone) return res.status(400).json({ error: 'Numéro Orange Money requis' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Calculer la nouvelle date d'expiration
    // Si déjà Pro actif → prolonger depuis l'expiration actuelle
    const now = new Date();
    const base = (user.isPro && user.proUntil && user.proUntil > now) ? user.proUntil : now;
    const proUntil = new Date(base);
    proUntil.setMonth(proUntil.getMonth() + plan.months);

    await User.findByIdAndUpdate(req.user.id, { isPro: true, proUntil });

    // Enregistrer le paiement
    const ref = genRef();
    await Payment.create({
      type: 'boost',
      buyer: req.user.id,
      buyerPhone: phone,
      adTitle: `Abonnement Pro ${plan.months} mois`,
      amount: plan.amount,
      boostType: 'pro_' + planId,
      reference: ref,
      status: 'success',
    });

    // Email de confirmation
    const emailUser = await User.findById(req.user.id).select('email prenom');
    if (emailUser?.email && emailUser.email.includes('@')) {
      const expiryStr = proUntil.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px">
        <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#FF5C00,#FF9500);padding:24px;text-align:center">
            <div style="font-size:32px;margin-bottom:6px">⭐</div>
            <div style="font-size:20px;font-weight:900;color:#fff">Bienvenue dans Pro !</div>
          </div>
          <div style="padding:24px">
            <p>Bonjour <strong>${emailUser.prenom}</strong>,</p>
            <p>Votre abonnement <strong>Pro ${plan.months} mois</strong> est actif.</p>
            <div style="background:#FFF0E8;border:1px solid #FFCBB0;border-radius:8px;padding:14px;margin:16px 0">
              <ul style="margin:0;padding-left:16px;font-size:13px;line-height:2">
                <li>Badge ⭐ PRO sur vos annonces</li>
                <li>Priorité dans les résultats</li>
                <li>Jusqu'à 12 annonces actives</li>
                <li>Statistiques avancées</li>
              </ul>
            </div>
            <p style="font-size:13px;color:#666">Expire le : <strong>${expiryStr}</strong></p>
            <div style="text-align:center;margin-top:18px">
              <a href="https://yougouyougou.net" style="background:#FF5C00;color:#fff;padding:11px 24px;border-radius:7px;text-decoration:none;font-weight:700">Gérer mon compte →</a>
            </div>
          </div>
        </div>
      </body></html>`;
      sendEmail(emailUser.email, '⭐ Votre abonnement Pro YouGouYou est actif !', html,
        `Bonjour ${emailUser.prenom}, votre abonnement Pro ${plan.months} mois est actif jusqu'au ${expiryStr}.`)
        .catch(e => console.error('[PRO EMAIL]', e.message));
    }

    console.log(`[PRO] ✅ ${req.user.id} → plan=${planId} expires=${proUntil.toISOString()}`);
    res.json({ success: true, reference: ref, proUntil: proUntil.toISOString(), planId, months: plan.months });

  } catch(err) {
    console.error('[SUBSCRIBE-PRO]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ★ Boutique Pro — sauvegarder description
app.patch('/api/me/boutique', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isPro proUntil role');
    const isAdmin = user?.role === 'admin';
    const isProActive = user?.isPro && user.proUntil && user.proUntil > new Date();
    if (!isAdmin && !isProActive)
      return res.status(403).json({ error: 'Réservé aux membres Pro' });

    const allowed = ['boutiqueName','boutiqueDesc','boutiqueSlogan','boutiqueBanner',
                     'boutiqueSector','boutiqueHours','boutiqueSocial'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const updated = await User.findByIdAndUpdate(req.user.id, update, { new: true })
      .select(allowed.join(' '));
    res.json({ success: true, boutique: updated });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Épingler / désépingler une annonce dans la boutique
app.patch('/api/me/boutique/pin/:adId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isPro proUntil role boutiquePinned');
    const isAdmin = user?.role === 'admin';
    const isProActive = user?.isPro && user.proUntil && user.proUntil > new Date();
    if (!isAdmin && !isProActive) return res.status(403).json({ error: 'Pro requis' });

    const adId = req.params.adId;
    const pinned = (user.boutiquePinned || []).map(String);
    const idx = pinned.indexOf(adId);
    if (idx >= 0) pinned.splice(idx, 1);          // désépingler
    else if (pinned.length < 3) pinned.push(adId); // épingler (max 3)
    else return res.status(400).json({ error: 'Maximum 3 annonces épinglées' });

    await User.findByIdAndUpdate(req.user.id, { boutiquePinned: pinned });
    res.json({ success: true, pinned });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Catalogue boutique : CRUD articles indépendants ──
app.get('/api/me/boutique/items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('boutiqueItems');
    res.json({ items: user?.boutiqueItems || [] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/me/boutique/items', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('isPro proUntil role boutiqueItems');
    const isAdmin = user?.role === 'admin';
    const isProActive = user?.isPro && user.proUntil && user.proUntil > new Date();
    if (!isAdmin && !isProActive) return res.status(403).json({ error: 'Pro requis' });
    const { name, price, desc, photo, category, subCategory, subItem, inStock } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    const item = { name: name.trim(), price: Number(price)||0, desc, photo, category, subCategory: subCategory||'', subItem: subItem||'', inStock: inStock !== false };
    await User.findByIdAndUpdate(req.user.id, { $push: { boutiqueItems: item } });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/me/boutique/items/:itemId', auth, async (req, res) => {
  try {
    const { name, price, desc, photo, category, inStock } = req.body;
    const update = {};
    if (name !== undefined)     update['boutiqueItems.$.name']     = name;
    if (price !== undefined)    update['boutiqueItems.$.price']    = Number(price)||0;
    if (desc !== undefined)     update['boutiqueItems.$.desc']     = desc;
    if (photo !== undefined)    update['boutiqueItems.$.photo']    = photo;
    if (category !== undefined) update['boutiqueItems.$.category'] = category;
    if (inStock !== undefined)  update['boutiqueItems.$.inStock']  = inStock;
    await User.findOneAndUpdate(
      { _id: req.user.id, 'boutiqueItems._id': req.params.itemId },
      { $set: update }
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/me/boutique/items/:itemId', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id,
      { $pull: { boutiqueItems: { _id: req.params.itemId } } });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ★ Admin — lister toutes les conversations
app.get('/api/admin/conversations', auth, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit)||200, 500);
    const convs = await Conversation.find()
      .populate('buyerId',  'prenom nom phone')
      .populate('sellerId', 'prenom nom phone')
      .populate('adId',     'title')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    const result = convs.map(function(conv){
      return {
        _id:          conv._id,
        buyer:        conv.buyerId  || { prenom: conv.buyerName  || '?' },
        seller:       conv.sellerId || { prenom: conv.sellerName || '?' },
        adId:         conv.adId     || { title: conv.adTitle || '—' },
        messageCount: (conv.messages||[]).length,
        lastMessage:  conv.lastMessage || (conv.messages&&conv.messages.length ? conv.messages[conv.messages.length-1].text : ''),
        updatedAt:    conv.updatedAt,
        createdAt:    conv.createdAt,
      };
    });

    res.json({ conversations: result, total: result.length });
  } catch(err) {
    console.error('[ADMIN CONVS]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ★ Pro — outils Pro (statistiques avancées)
app.get('/api/pro/tools', auth, requirePro, async (req, res) => {
  try {
    const ads = await Ad.find({ seller: req.user.id, active: true }).select('views title createdAt');
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30*24*3600*1000);
    const sevenDaysAgo  = new Date(now - 7*24*3600*1000);

    // Vues par annonce
    const adStats = ads.map(a => ({
      id:     a._id,
      title:  a.title,
      views:  a.views || 0,
      days:   Math.floor((now - a.createdAt) / 86400000),
    })).sort((a,b) => b.views - a.views);

    // Contacts reçus (paiements de type commission sur ses annonces)
    const adIds = ads.map(a => a._id);
    const contacts30 = await Payment.countDocuments({
      type: 'commission',
      createdAt: { $gte: thirtyDaysAgo },
    });

    res.json({
      totalAds:    ads.length,
      totalViews:  ads.reduce((acc,a) => acc+(a.views||0), 0),
      contacts30,
      adStats,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Sitemap XML dynamique (SEO)
app.get('/sitemap.xml', async (req, res) => {
  try {
    const ads = await Ad.find({ active: true }).select('_id createdAt').sort({ createdAt: -1 }).limit(1000);
    const base = 'https://yougouyougou.net';
    const urls = [
      `<url><loc>${base}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...ads.map(a =>
        `<url><loc>${base}/annonce/${a._id}</loc><lastmod>${a.createdAt.toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
      )
    ].join('\n');
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch(err) {
    res.status(500).send('<?xml version="1.0"?><urlset/>');
  }
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://yougouyougou.net/sitemap.xml\n');
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 YouGouYou API v3 démarrée sur le port ${PORT}`);

  // KEEP-ALIVE : ping toutes les 10 min (évite cold start Render free tier)
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    try {
      const mod = SELF_URL.startsWith('https') ? require('https') : require('http');
      mod.get(`${SELF_URL}/api/health`, () => console.log('💓 Keep-alive OK')).on('error', ()=>{});
    } catch(e) {}
  }, 10 * 60 * 1000);

  // CRON ALERTES : vérifier toutes les heures si de nouvelles annonces déclenchent des alertes
  setInterval(async () => {
    try {
      const since = new Date(Date.now() - 3600000);
      const recentAds = await Ad.find({ createdAt: { $gte: since }, active: true });
      for (const ad of recentAds) await triggerAlerts(ad);
    } catch(e) { console.error('[CRON ALERTES]', e.message); }
  }, 60 * 60 * 1000);

  // Nettoyage : désactiver comptes pro expirés (1x/jour)
  setInterval(async () => {
    try {
      await User.updateMany({ isPro: true, proUntil: { $lt: new Date() } }, { isPro: false });
    } catch(e) {}
  }, 24 * 60 * 60 * 1000);
});
