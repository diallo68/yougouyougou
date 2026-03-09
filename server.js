const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ygy_secret_change_in_prod';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yougouyougou';

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // servir le HTML

// ─── MODELS ───────────────────────────────────
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB connecté'));

const UserSchema = new mongoose.Schema({
  prenom: String, nom: String,
  email: String, telephone: { type: String, required: true, unique: true },
  password: String, ville: String,
  createdAt: { type: Date, default: Date.now }
});
const AdSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: String,
  prix: Number, categorie: String, ville: String, quartier: String,
  etat: String, photos: [String], emoji: String,
  vendeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vendeurNom: String, vendeurTel: String,
  featured: { type: Boolean, default: false },
  vues: { type: Number, default: 0 },
  actif: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const PaymentSchema = new mongoose.Schema({
  reference: String, montant: Number,
  annonce: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
  annonceTitle: String,
  acheteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  telephone: String, statut: { type: String, default: 'success' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Ad = mongoose.model('Ad', AdSchema);
const Payment = mongoose.model('Payment', PaymentSchema);

// ─── MIDDLEWARE AUTH ───────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

// ─── ROUTES AUTH ──────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { prenom, nom, telephone, email, password, ville } = req.body;
    if (!prenom || !telephone || !password)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    const exists = await User.findOne({ telephone });
    if (exists) return res.status(400).json({ error: 'Numéro déjà utilisé' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ prenom, nom, telephone, email, password: hash, ville });
    const token = jwt.sign({ id: user._id, nom: `${prenom} ${nom}`, telephone }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, prenom, nom, telephone, ville } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { telephone, password } = req.body;
    const user = await User.findOne({ telephone });
    if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });
    const token = jwt.sign({ id: user._id, nom: `${user.prenom} ${user.nom}`, telephone }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, prenom: user.prenom, nom: user.nom, telephone, ville: user.ville } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ROUTES ANNONCES ──────────────────────────
app.get('/api/ads', async (req, res) => {
  const { categorie, ville, q, featured, page = 1, limit = 20 } = req.query;
  const filter = { actif: true };
  if (categorie) filter.categorie = categorie;
  if (ville) filter.ville = ville;
  if (q) filter.titre = { $regex: q, $options: 'i' };
  if (featured === 'true') filter.featured = true;
  const ads = await Ad.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(Number(limit));
  const total = await Ad.countDocuments(filter);
  res.json({ ads, total, pages: Math.ceil(total/limit) });
});

app.get('/api/ads/:id', async (req, res) => {
  const ad = await Ad.findByIdAndUpdate(req.params.id, { $inc: { vues: 1 } }, { new: true });
  if (!ad) return res.status(404).json({ error: 'Annonce non trouvée' });
  res.json(ad);
});

app.post('/api/ads', auth, async (req, res) => {
  try {
    const { titre, description, prix, categorie, ville, quartier, etat, emoji } = req.body;
    if (!titre || !prix) return res.status(400).json({ error: 'Titre et prix obligatoires' });
    const user = await User.findById(req.user.id);
    const ad = await Ad.create({
      titre, description, prix, categorie, ville, quartier, etat, emoji,
      vendeur: req.user.id, vendeurNom: req.user.nom, vendeurTel: user?.telephone
    });
    res.json(ad);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ads/:id', auth, async (req, res) => {
  const ad = await Ad.findOne({ _id: req.params.id, vendeur: req.user.id });
  if (!ad) return res.status(403).json({ error: 'Non autorisé' });
  await Ad.findByIdAndUpdate(req.params.id, { actif: false });
  res.json({ success: true });
});

app.get('/api/my-ads', auth, async (req, res) => {
  const ads = await Ad.find({ vendeur: req.user.id, actif: true }).sort({ createdAt: -1 });
  res.json(ads);
});

// ─── ROUTES PAIEMENT ORANGE MONEY ─────────────
app.post('/api/payment/orange-money', auth, async (req, res) => {
  try {
    const { adId, telephone, montant } = req.body;
    // En production : appel API Orange Money ici
    // Pour test : simulation d'un paiement réussi
    const ref = 'OM' + Date.now().toString(36).toUpperCase();
    const ad = await Ad.findById(adId);
    const payment = await Payment.create({
      reference: ref, montant, annonce: adId,
      annonceTitle: ad?.titre || 'Article',
      acheteur: req.user.id, telephone, statut: 'success'
    });
    res.json({ success: true, reference: ref, payment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-payments', auth, async (req, res) => {
  const payments = await Payment.find({ acheteur: req.user.id }).sort({ createdAt: -1 });
  res.json(payments);
});

// ─── HEALTH CHECK ─────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'OK', version: '1.0.0' }));

// ─── SERVE FRONTEND ───────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 YouGouYou démarré sur http://localhost:${PORT}`));
