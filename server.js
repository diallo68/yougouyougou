// ═══════════════════════════════════════════════════════════
//  YouGouYou — server.js
//  Stack : Node.js + Express + MongoDB Atlas + JWT
//  Vérification : SMS (Orange) OU Email (Nodemailer)
// ═══════════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
// Email via SendGrid API (HTTP — fonctionne sur Render)
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──────────────────────────────────────────────
// Compression gzip pour réduire la taille des réponses
try {
  const compression = require('compression');
  app.use(compression());
} catch(e) {}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── CONNEXION MONGODB ATLAS ─────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas connecté'))
.catch(err => console.error('❌ MongoDB erreur :', err));

// ── TRANSPORTEUR EMAIL (Nodemailer) ─────────────────────────
// Configure avec Gmail ou SMTP de ton choix
// Variables d'environnement à ajouter sur Render :
//   EMAIL_HOST     = smtp.gmail.com
//   EMAIL_PORT     = 587
//   EMAIL_USER     = yougouyougou@gmail.com
//   EMAIL_PASS     = (mot de passe application Gmail)
// ── Vérification config email au démarrage ──
if (process.env.SENDGRID_API_KEY) {
  console.log('✅ [EMAIL] SendGrid configuré — envoi depuis:', process.env.EMAIL_FROM || 'noreply@yougouyougou.net');
} else {
  console.warn('⚠️ [EMAIL] SENDGRID_API_KEY non défini — emails désactivés');
}

// Fonction d'envoi d'email de vérification
async function sendVerificationEmail(to, code, prenom) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[EMAIL] SendGrid non configuré — code:', code, '→', to);
    return; // pas d'erreur, le code est déjà retourné dans debug_code
  }

  const fromEmail = process.env.EMAIL_FROM || 'noreply@yougouyougou.net';
  const fromName  = 'YouGouYou 🇬🇳';

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#F5F2EE;font-family:Helvetica Neue,Arial,sans-serif">
    <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <div style="background:linear-gradient(135deg,#FF5C00,#FF6A00);padding:36px 40px;text-align:center">
        <div style="font-size:36px;margin-bottom:10px">&#127468;&#127475;</div>
        <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px">YouGouYou</div>
        <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px">Le marché de la Guinée</div>
      </div>
      <div style="padding:36px 40px">
        <p style="font-size:16px;color:#0E0E0E;margin-bottom:8px">Bonjour <strong>${prenom}</strong> 👋</p>
        <p style="font-size:14px;color:#767676;line-height:1.7;margin-bottom:28px">
          Voici votre code de vérification pour finaliser votre inscription sur <strong>YouGouYou</strong>.
        </p>
        <div style="background:#FFF3EE;border:2px solid #FFB899;border-radius:16px;padding:28px;text-align:center;margin-bottom:28px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#767676;margin-bottom:10px">Votre code de vérification</div>
          <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#FF5C00">${code}</div>
          <div style="font-size:12px;color:#767676;margin-top:10px">Ce code expire dans 15 minutes</div>
        </div>
        <p style="font-size:13px;color:#A8A8A8;line-height:1.7">
          Si vous n'avez pas créé de compte sur YouGouYou, ignorez cet email.
        </p>
      </div>
      <div style="background:#F5F2EE;padding:20px 40px;text-align:center;border-top:1px solid #E2DDD7">
        <div style="font-size:12px;color:#A8A8A8">
          &copy; 2025 YouGouYou &middot; Conakry, Guinée<br>
          <a href="https://yougouyougou.net" style="color:#FF5C00;text-decoration:none">yougouyougou.net</a>
        </div>
      </div>
    </div>
  </body></html>`;

  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    subject: `${code} — Votre code de vérification YouGouYou`,
    content: [
      { type: 'text/plain', value: `Bonjour ${prenom},\n\nVotre code YouGouYou : ${code}\n\nExpire dans 15 min.\n\nyoougouyougou.net` },
      { type: 'text/html',  value: html }
    ]
  });

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SendGrid ${response.status}: ${err}`);
  }
  console.log('✅ [EMAIL] SendGrid envoyé à', to);
}

// ═══════════════════════════════════════════════════════════
//  SCHÉMAS MONGOOSE
// ═══════════════════════════════════════════════════════════

// ── Utilisateur ─────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  prenom:        { type: String, required: true, trim: true },
  nom:           { type: String, trim: true },
  phone:         { type: String, required: true, unique: true },
  email:         { type: String, trim: true, lowercase: true },
  password:      { type: String, required: true },
  city:          { type: String },
  role:          { type: String, enum: ['user', 'admin'], default: 'user' },
  verified:      { type: Boolean, default: false },
  verifyMethod:  { type: String, enum: ['sms', 'email'], default: 'sms' },
  verifyCode:    { type: String },    // code 4 chiffres (SMS ou email)
  codeExpiry:    { type: Date },      // expire dans 15 min
  createdAt:     { type: Date, default: Date.now },
});
const User = mongoose.model('User', UserSchema);

// Index pour accélérer les recherches
UserSchema.index({ phone: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

// ── Annonce ──────────────────────────────────────────────────
const AdSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String },
  price:        { type: Number, required: true },
  category:     { type: String },
  city:         { type: String },
  quartier:     { type: String },
  etat:         { type: String },
  condition:    { type: String },
  emoji:        { type: String, default: '📦' },
  photos:       [String],           // base64 ou URLs
  tags:         [String],
  featured:     { type: Boolean, default: false },
  views:        { type: Number, default: 0 },
  seller:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerName:   { type: String },
  sellerPhone:  { type: String },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Date, default: Date.now },
});
const Ad = mongoose.model('Ad', AdSchema);

// ── Paiement Orange Money ────────────────────────────────────
const PaymentSchema = new mongoose.Schema({
  type:         { type: String, enum: ['purchase', 'commission'], default: 'purchase' },
  buyer:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  buyerPhone:   { type: String },
  ad:           { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  adTitle:      { type: String },
  amount:       { type: Number, required: true },
  commission:   { type: Number, default: 0 },   // 10% du prix
  reference:    { type: String, unique: true },
  status:       { type: String, enum: ['pending','success','failed'], default: 'success' },
  createdAt:    { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', PaymentSchema);

// ═══════════════════════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET || 'ygy_secret_change_in_prod';

function genRef() {
  return 'OM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
}

// Middleware auth
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// Middleware admin uniquement
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé — admin uniquement' });
  next();
}

// ═══════════════════════════════════════════════════════════
//  AUTH — INSCRIPTION / CONNEXION
//  Vérification : SMS (numéro Orange) OU Email (4 chiffres)
// ═══════════════════════════════════════════════════════════

// ── Étape 1 : Envoyer le code de vérification ──────────────
// method = "sms"   → envoie le code par SMS Orange
// method = "email" → envoie le code par email (nodemailer)
app.post('/api/auth/send-code', async (req, res) => {
  try {
    const { phone, email, method = 'sms', prenom = 'Utilisateur' } = req.body;

    if (method === 'sms'   && !phone) return res.status(400).json({ error: 'Numéro requis pour SMS' });
    if (method === 'email' && !email) return res.status(400).json({ error: 'Email requis' });

    const code   = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    const query = method === 'email' && email ? { email: email.toLowerCase() } : { phone };
    const update = { verifyCode: code, codeExpiry: expiry, method };
    if (phone) update.phone = phone;
    if (email) update.email = email.toLowerCase();
    await User.findOneAndUpdate(query, update, { upsert: true, new: true });

    let emailSent = false;
    if (method === 'sms') {
      console.log(`📱 [SMS] Code pour ${phone} : ${code}`);
    } else {
      try {
        await sendVerificationEmail(email, code, prenom);
        emailSent = true;
        console.log(`📧 [EMAIL] Code envoyé à ${email} : ${code}`);
      } catch (emailErr) {
        console.error(`📧 [EMAIL] Échec envoi à ${email} :`, emailErr.message);
      }
    }

    // Toujours renvoyer debug_code pour affichage à l'écran
    res.json({
      success: true, method, emailSent,
      message: emailSent ? `Code envoyé à ${email}` : `Code généré — consultez l'écran`,
      debug_code: code,
    });
  } catch (err) {
    console.error('send-code error:', err.message);
    res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
});

// ── Étape 2 : Vérifier le code et créer le compte ──────────
app.post('/api/register', async (req, res) => {
  try {
    const { prenom, nom, phone, email, password, city, code, method = 'sms' } = req.body;
    if (!prenom || !password || !code)
      return res.status(400).json({ error: 'Champs requis : prenom, password, code' });

    // Chercher le document pending par téléphone OU email
    let pending = null;
    if (phone) pending = await User.findOne({ phone });
    if (!pending && email) pending = await User.findOne({ email: email.toLowerCase() });
    if (!pending)
      return res.status(400).json({ error: "Aucune demande pour ce numéro — demandez un code d'abord" });
    if (pending.verified)
      return res.status(400).json({ error: 'Ce numéro est déjà inscrit' });
    if (pending.verifyCode !== code)
      return res.status(400).json({ error: 'Code incorrect — vérifiez et réessayez' });
    if (pending.codeExpiry && new Date() > pending.codeExpiry)
      return res.status(400).json({ error: 'Code expiré (15 min) — demandez un nouveau code' });

    const hashed = await bcrypt.hash(password, 10);
    const query = phone ? { phone } : { email: email.toLowerCase() };
    const user = await User.findOneAndUpdate(
      query,
      { prenom, nom: nom||'', phone: phone||'', email: (email||'').toLowerCase(),
        password: hashed, city: city||'',
        verified: true, method, verifyCode: null, codeExpiry: null },
      { upsert: true, new: true }
    );

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true, token,
      user: { id: user._id, name: `${prenom} ${nom||''}`.trim(),
              prenom, nom: nom||'', phone: phone||'', email: (email||'').toLowerCase(),
              city: city||'', role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Connexion : téléphone OU email ──────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: "Identifiant et mot de passe requis" });

    // Recherche par téléphone OU par email (avec ou sans +224)
    const phoneVariants = [identifier, '+224'+identifier.replace(/^\+224/,''), identifier.replace(/^\+224/,'')];
    const user = await User.findOne({
      $or: [
        { phone: { $in: phoneVariants } },
        { email: identifier.toLowerCase() }
      ]
    });
    if (!user)
      return res.status(400).json({ error: "Compte introuvable — vérifiez votre numéro ou email" });
    if (!user.verified)
      return res.status(400).json({ error: "Compte non vérifié — confirmez votre SMS ou email" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true, token,
      user: { id: user._id, name: `${user.prenom} ${user.nom||''}`.trim(),
              phone: user.phone, email: user.email, city: user.city, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Renvoyer un code ────────────────────────────────────────
app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const { phone, email, method = 'sms', prenom = 'Utilisateur' } = req.body;
    const code   = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await User.findOneAndUpdate({ phone }, { verifyCode: code, codeExpiry: expiry }, { upsert: true });
    if (method === 'email' && email) await sendVerificationEmail(email, code, prenom);
    else console.log(`📱 [RESEND] Code pour ${phone} : ${code}`);
    res.json({ success: true, message: 'Nouveau code envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_code: code }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════
//  ANNONCES
// ═══════════════════════════════════════════════════════════

// ── Profil utilisateur connecté (vérifie le rôle depuis MongoDB) ────────────
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -verifyCode -codeExpiry');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({
      user: {
        id: user._id,
        name: `${user.prenom} ${user.nom||''}`.trim(),
        prenom: user.prenom,
        nom: user.nom,
        phone: user.phone,
        email: user.email,
        city: user.city,
        role: user.role,
        verified: user.verified,
        method: user.method,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lister toutes les annonces (public)
app.get('/api/ads', async (req, res) => {
  try {
    const { category, city, minPrice, maxPrice, q, limit = 50, skip = 0 } = req.query;
    const filter = { active: true };
    if (category) filter.category = category;
    if (city)     filter.city = new RegExp(city, 'i');
    if (q)        filter.$or = [{ title: new RegExp(q,'i') }, { description: new RegExp(q,'i') }];
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    const ads = await Ad.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .select('-sellerPhone'); // ne pas exposer le téléphone publiquement
    const total = await Ad.countDocuments(filter);
    res.json({ ads, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Détail d'une annonce (sans téléphone)
app.get('/api/ads/:id', async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('-sellerPhone');
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publier une annonce (auth requis)
app.post('/api/ads', auth, async (req, res) => {
  try {
    const { title, description, price, category, city, quartier, etat, phone, photos, seller: sellerName } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Titre et prix obligatoires' });

    const ad = await Ad.create({
      title, description, price: Number(price),
      category, city, quartier, etat,
      sellerName: sellerName || req.user.prenom || '',
      sellerPhone: phone || '',
      seller: req.user.id,
      photos: Array.isArray(photos) ? photos.slice(0,8) : [],
      active: true,
    });

    res.json({ success: true, ad });
  } catch (err) {
    console.error('POST /api/ads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Supprimer une annonce (propriétaire ou admin)
app.delete('/api/ads/:id', auth, async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Introuvable' });
    if (String(ad.seller) !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Non autorisé' });
    await ad.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mes annonces (auth)
app.get('/api/my-ads', auth, async (req, res) => {
  try {
    const ads = await Ad.find({ seller: req.user.id }).sort({ createdAt: -1 });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  PAIEMENT — ORANGE MONEY + COMMISSION 10%
// ═══════════════════════════════════════════════════════════

// Paiement standard (acheter un article)
app.post('/api/payment/orange-money', auth, async (req, res) => {
  try {
    const { adId, buyerPhone, pin } = req.body;
    if (!adId || !buyerPhone) return res.status(400).json({ error: 'Données manquantes' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    // En prod : appeler ici l'API Orange Money Guinée
    // const omResult = await orangeMoneyAPI.charge({ phone: buyerPhone, amount: ad.price, pin });

    const ref = genRef();
    const payment = await Payment.create({
      type:       'purchase',
      buyer:      req.user.id,
      buyerPhone,
      ad:         ad._id,
      adTitle:    ad.title,
      amount:     ad.price,
      reference:  ref,
      status:     'success',
    });

    res.json({ success: true, reference: ref, amount: ad.price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commission 10% pour voir le numéro de l'annonceur
app.post('/api/payment/commission', auth, async (req, res) => {
  try {
    const { adId, buyerPhone, pin } = req.body;
    if (!adId || !buyerPhone) return res.status(400).json({ error: 'Données manquantes' });

    const ad = await Ad.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Annonce introuvable' });

    const commission = Math.round(ad.price * 0.10);  // 10%

    // En prod : débiter la commission via Orange Money API
    // const omResult = await orangeMoneyAPI.charge({ phone: buyerPhone, amount: commission, pin });

    const ref = genRef();
    await Payment.create({
      type:       'commission',
      buyer:      req.user.id,
      buyerPhone,
      ad:         ad._id,
      adTitle:    ad.title,
      amount:     commission,
      commission,
      reference:  ref,
      status:     'success',
    });

    // Retourner le vrai numéro du vendeur UNIQUEMENT après paiement
    res.json({
      success:    true,
      reference:  ref,
      commission,
      sellerPhone: ad.sellerPhone,   // révélé seulement ici
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mes paiements (auth)
app.get('/api/my-payments', auth, async (req, res) => {
  try {
    const pays = await Payment.find({ buyer: req.user.id }).sort({ createdAt: -1 });
    res.json(pays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — ENDPOINTS PROTÉGÉS
//  Accès : Bearer token avec role = 'admin'
// ═══════════════════════════════════════════════════════════

// Tableau de bord admin global
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalAds, totalPayments, revenueResult] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ active: true }),
      Payment.countDocuments({ status: 'success' }),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const revenue = revenueResult[0]?.total || 0;
    res.json({ totalUsers, totalAds, totalPayments, revenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste de tous les utilisateurs inscrits
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0, search } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { prenom: new RegExp(search, 'i') },
      { nom:    new RegExp(search, 'i') },
      { phone:  new RegExp(search, 'i') },
      { city:   new RegExp(search, 'i') },
    ];
    const users = await User.find(filter)
      .select('-password -smsCode')   // ne jamais exposer le mot de passe
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await User.countDocuments(filter);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Détail d'un utilisateur
app.get('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -smsCode');
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const ads  = await Ad.find({ seller: user._id }).sort({ createdAt: -1 });
    const pays = await Payment.find({ buyer: user._id }).sort({ createdAt: -1 });
    res.json({ user, ads, payments: pays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Changer le rôle d'un utilisateur (user → admin)
app.patch('/api/admin/users/:id/role', auth, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer un utilisateur
app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Ad.deleteMany({ seller: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste de toutes les annonces (admin)
app.get('/api/admin/ads', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const ads = await Ad.find()
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await Ad.countDocuments();
    res.json({ ads, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre une annonce en vedette
app.patch('/api/admin/ads/:id/feature', auth, adminOnly, async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { featured: req.body.featured },
      { new: true }
    );
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste de tous les paiements (admin)
app.get('/api/admin/payments', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 100, skip = 0, type } = req.query;
    const filter = {};
    if (type) filter.type = type;
    const pays = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate('buyer', 'prenom nom phone')
      .populate('ad', 'title price');
    const total = await Payment.countDocuments(filter);
    const revenue = await Payment.aggregate([
      { $match: { status: 'success', ...filter } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    res.json({ payments: pays, total, revenue: revenue[0]?.total || 0 });
  } catch (err) {
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
    version: '2.1.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 YouGouYou API démarrée sur le port ${PORT}`);

  // KEEP-ALIVE : ping toutes les 10 min pour éviter cold start Render
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    try {
      const mod = SELF_URL.startsWith('https') ? require('https') : require('http');
      mod.get(`${SELF_URL}/api/health`, () => {
        console.log('💓 Keep-alive OK');
      }).on('error', () => {});
    } catch(e) {}
  }, 10 * 60 * 1000);
});
