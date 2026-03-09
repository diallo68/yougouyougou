// ═══════════════════════════════════════════════════════════
//  YouGouYou — server.js
//  Stack : Node.js + Express + MongoDB Atlas + JWT
// ═══════════════════════════════════════════════════════════

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CONNEXION MONGODB ATLAS ─────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas connecté'))
.catch(err => console.error('❌ MongoDB erreur :', err));

// ═══════════════════════════════════════════════════════════
//  SCHÉMAS MONGOOSE
// ═══════════════════════════════════════════════════════════

// ── Utilisateur ─────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  prenom:       { type: String, required: true, trim: true },
  nom:          { type: String, trim: true },
  phone:        { type: String, required: true, unique: true },
  email:        { type: String, trim: true, lowercase: true },
  password:     { type: String, required: true },
  city:         { type: String },
  role:         { type: String, enum: ['user', 'admin'], default: 'user' },
  verified:     { type: Boolean, default: false },
  smsCode:      { type: String },                // code SMS temporaire
  createdAt:    { type: Date, default: Date.now },
});
const User = mongoose.model('User', UserSchema);

// ── Annonce ──────────────────────────────────────────────────
const AdSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String },
  price:        { type: Number, required: true },
  category:     { type: String },
  city:         { type: String },
  quartier:     { type: String },
  condition:    { type: String },
  emoji:        { type: String, default: '📦' },
  tags:         [String],
  featured:     { type: Boolean, default: false },
  views:        { type: Number, default: 0 },
  seller:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerName:   { type: String },
  sellerPhone:  { type: String },   // stocké chiffré en prod
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
//  AUTH — INSCRIPTION / CONNEXION / SMS
// ═══════════════════════════════════════════════════════════

// Étape 1 : envoyer le code SMS (simulé — intégrer Orange SMS API en prod)
app.post('/api/auth/send-sms', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numéro requis' });

    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Sauvegarder le code temporairement (ou en mémoire/Redis en prod)
    await User.findOneAndUpdate(
      { phone },
      { smsCode: code },
      { upsert: false }
    );

    // En prod : appeler l'API SMS d'Orange Guinée ici
    console.log(`📱 Code SMS pour ${phone} : ${code}`);

    // En dev on renvoie le code dans la réponse (retirer en prod !)
    res.json({
      success: true,
      message: 'Code SMS envoyé',
      ...(process.env.NODE_ENV !== 'production' && { debug_code: code })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Étape 2 : inscription complète avec vérification SMS
app.post('/api/register', async (req, res) => {
  try {
    const { prenom, nom, phone, email, password, city, smsCode } = req.body;
    if (!prenom || !phone || !password) return res.status(400).json({ error: 'Champs requis manquants' });

    // Vérifier si l'utilisateur existe déjà
    const exists = await User.findOne({ phone });
    if (exists && exists.verified) return res.status(400).json({ error: 'Ce numéro est déjà inscrit' });

    // En prod : vérifier le code SMS reçu
    // if (exists && exists.smsCode !== smsCode) return res.status(400).json({ error: 'Code SMS incorrect' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      { phone },
      { prenom, nom, phone, email, password: hashed, city, verified: true, smsCode: null },
      { upsert: true, new: true }
    );

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      token,
      user: { id: user._id, name: `${prenom} ${nom||''}`.trim(), phone, city, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'Numéro introuvable' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      token,
      user: { id: user._id, name: `${user.prenom} ${user.nom||''}`.trim(), phone: user.phone, city: user.city, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ANNONCES
// ═══════════════════════════════════════════════════════════

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
    const { title, description, price, category, city, quartier, condition, emoji, tags } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Titre et prix requis' });

    const user = await User.findById(req.user.id);
    const ad = await Ad.create({
      title, description, price: Number(price), category, city, quartier,
      condition, emoji: emoji || '📦', tags: tags || [],
      seller: user._id,
      sellerName: `${user.prenom} ${user.nom||''}`.trim(),
      sellerPhone: user.phone,
    });
    res.json({ success: true, ad: { ...ad.toObject(), sellerPhone: undefined } });
  } catch (err) {
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
    version: '2.0.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback — toutes les routes non-API vers index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 YouGouYou API démarrée sur le port ${PORT}`);
  console.log(`📋 Endpoints admin : /api/admin/users | /api/admin/ads | /api/admin/payments`);
});
