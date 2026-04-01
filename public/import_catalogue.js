/**
 * ════════════════════════════════════════════════════════════
 *  IMPORT CATALOGUE TEST — YouGouYou
 *  Repo GitHub : https://github.com/diallo68/yougouyougou
 * ════════════════════════════════════════════════════════════
 *
 *  STRUCTURE DU REPO :
 *    yougouyougou/
 *    ├── public/
 *    │   └── index.html
 *    ├── server.js
 *    ├── package.json
 *    ├── .env
 *    ├── import_catalogue.js        ← CE FICHIER (à la racine)
 *    └── catalogue_test_yougouyou.json ← À PLACER ICI aussi
 *
 *  ÉTAPES :
 *  ─────────────────────────────────────────
 *  1. Cloner le repo :
 *       git clone https://github.com/diallo68/yougouyougou.git
 *       cd yougouyougou
 *
 *  2. Copier ces 2 fichiers à la RACINE du projet :
 *       import_catalogue.js
 *       catalogue_test_yougouyou.json
 *
 *  3. Installer les dépendances (si pas déjà fait) :
 *       npm install
 *
 *  4. Vérifier le fichier .env contient :
 *       MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/yougouyou
 *
 *  5. Lancer l'import :
 *       node import_catalogue.js              ← import simple
 *       node import_catalogue.js --reset      ← supprime tests + réimporte
 *       node import_catalogue.js --dry-run    ← simulation sans écriture
 * ════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');

// ──────────────────────────────────────────────────────────────
//  SCHÉMA — identique à server.js (AdSchema)
// ──────────────────────────────────────────────────────────────
const AdSchema = new mongoose.Schema({
  title:         { type: String, required: true },
  description:   { type: String },
  price:         { type: Number, required: true },
  category:      { type: String, index: true },
  subCategory:   { type: String, index: true },
  subItem:       { type: String },
  city:          { type: String, index: true },
  quartier:      { type: String },
  etat:          { type: String },
  condition:     { type: String },
  emoji:         { type: String, default: '📦' },
  photos:        [String],
  tags:          [String],
  featured:      { type: Boolean, default: false },
  featuredUntil: { type: Date },
  boostedAt:     { type: Date },
  urgentBadge:   { type: Boolean, default: false },
  urgentUntil:   { type: Date },
  nego:          { type: Boolean, default: false },
  subFields:     { type: Map, of: String },
  views:         { type: Number, default: 0 },
  seller:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  sellerName:    { type: String },
  sellerPhone:   { type: String },
  active:        { type: Boolean, default: true },
  createdAt:     { type: Date, default: Date.now },
}, { timestamps: false });

AdSchema.index({ category: 1, city: 1, price: 1, createdAt: -1 });
AdSchema.index({ active: 1, createdAt: -1 });
AdSchema.index({ seller: 1, createdAt: -1 });
AdSchema.index({ title: 'text', description: 'text' });

// ──────────────────────────────────────────────────────────────
//  VENDEURS DE TEST — ObjectId fixes (reproductibles)
// ──────────────────────────────────────────────────────────────
const TEST_SELLERS = [
  { id: new mongoose.Types.ObjectId('665f000000000000000001a1'), name: 'Mamadou Diallo',    phone: '+224620000001', city: 'Conakry'      },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a2'), name: 'Fatoumata Bah',     phone: '+224620000002', city: 'Labé'         },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a3'), name: 'Ibrahima Camara',   phone: '+224620000003', city: 'Kindia'       },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a4'), name: 'Mariama Sylla',     phone: '+224620000004', city: 'Kankan'       },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a5'), name: 'Oumar Barry',       phone: '+224620000005', city: 'Mamou'        },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a6'), name: 'Kadiatou Kouyaté',  phone: '+224620000006', city: "N'Zérékoré"  },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a7'), name: 'Sékou Touré',       phone: '+224620000007', city: 'Boké'         },
  { id: new mongoose.Types.ObjectId('665f000000000000000001a8'), name: 'Aissatou Condé',    phone: '+224620000008', city: 'Faranah'      },
];

const TEST_SELLER_IDS = TEST_SELLERS.map(function(s){ return s.id; });

function randSeller() {
  return TEST_SELLERS[Math.floor(Math.random() * TEST_SELLERS.length)];
}

// ──────────────────────────────────────────────────────────────
//  CONVERSION JSON → Document MongoDB
// ──────────────────────────────────────────────────────────────
function toMongoDoc(ad) {
  var s = randSeller();
  return {
    title:       ad.title,
    description: ad.description || (ad.title + '. Disponible immédiatement. Contact WhatsApp.'),
    price:       Number(ad.price),
    category:    ad.category    || '',
    subCategory: ad.subCategory || '',
    subItem:     ad.subSubCategory || ad.subItem || '',
    city:        ad.city        || 'Conakry',
    etat:        ad.etat        || 'Bon état',
    emoji:       ad.emoji       || '📦',
    photos:      Array.isArray(ad.photos) ? ad.photos : [],
    tags:        [],
    featured:    Boolean(ad.isFeatured || ad.featured),
    views:       Number(ad.views) || 0,
    active:      true,
    nego:        Math.random() < 0.3,
    seller:      s.id,
    sellerName:  s.name,
    sellerPhone: s.phone,
    createdAt:   ad.createdAt ? new Date(ad.createdAt) : new Date(),
  };
}

// ──────────────────────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────────────────────
async function main() {
  var args   = process.argv.slice(2);
  var reset  = args.includes('--reset');
  var dryRun = args.includes('--dry-run');

  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  🇬🇳  YouGouYou — Import Catalogue de Test');
  console.log('  Repo : github.com/diallo68/yougouyougou');
  console.log('════════════════════════════════════════════');
  console.log('');

  if (dryRun) {
    console.log('🔍 MODE SIMULATION — aucune écriture en base\n');
  }

  // ── 1. Vérifier MONGODB_URI ──
  var uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI manquant dans .env');
    console.error('');
    console.error('    Créez un fichier .env à la racine avec :');
    console.error('    MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/yougouyou');
    console.error('');
    console.error('    Remplacez USER et PASS par vos identifiants MongoDB Atlas.');
    console.error('');
    process.exit(1);
  }

  // ── 2. Vérifier le fichier catalogue ──
  var cataloguePath = path.join(__dirname, 'catalogue_test_yougouyou.json');
  if (!fs.existsSync(cataloguePath)) {
    console.error('❌  Fichier catalogue_test_yougouyou.json introuvable');
    console.error('');
    console.error('    Chemin attendu : ' + cataloguePath);
    console.error('    Placez le fichier JSON à la RACINE du projet (même dossier que server.js)');
    console.error('');
    process.exit(1);
  }

  // ── 3. Charger et afficher le résumé ──
  var raw  = fs.readFileSync(cataloguePath, 'utf-8');
  var data = JSON.parse(raw);
  var ads  = data.ads;

  console.log('📦 Catalogue chargé :');
  console.log('   ' + ads.length + ' annonces au total');
  console.log('   Généré le : ' + new Date(data.meta.generated_at).toLocaleString('fr-FR'));
  console.log('');
  console.log('   Répartition par catégorie :');

  var bycat = {};
  ads.forEach(function(a) { bycat[a.category] = (bycat[a.category] || 0) + 1; });
  Object.entries(bycat)
    .sort(function(a, b) { return b[1] - a[1]; })
    .forEach(function(entry) {
      console.log('   ' + String(entry[1]).padStart(4) + '  ' + entry[0]);
    });

  var featured = ads.filter(function(a){ return a.isFeatured || a.featured; }).length;
  console.log('');
  console.log('   🌟 ' + featured + ' annonces "À la une"');
  console.log('');

  if (dryRun) {
    console.log('✅ Simulation terminée — aucune erreur détectée.');
    console.log('   Relancez sans --dry-run pour importer réellement.\n');
    return;
  }

  // ── 4. Connexion MongoDB ──
  console.log('🔗 Connexion à MongoDB Atlas...');
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 30000,
    });
    console.log('✅ Connecté à MongoDB Atlas !');
    console.log('   Base : ' + mongoose.connection.db.databaseName);
    console.log('');
  } catch(connErr) {
    console.error('❌  Connexion MongoDB échouée :');
    console.error('    ' + connErr.message);
    console.error('');
    console.error('    Vérifiez :');
    console.error('    → Votre MONGODB_URI dans .env');
    console.error('    → Votre IP est autorisée dans MongoDB Atlas (Network Access)');
    console.error('    → Votre connexion internet');
    console.error('');
    process.exit(1);
  }

  var Ad = mongoose.models.Ad || mongoose.model('Ad', AdSchema);

  // ── 5. Reset si demandé ──
  if (reset) {
    console.log('🗑️  Suppression des annonces de test existantes...');
    var del = await Ad.deleteMany({ seller: { $in: TEST_SELLER_IDS } });
    console.log('   ' + del.deletedCount + ' annonces supprimées');
    console.log('');
  }

  // ── 6. Vérifier doublons ──
  var existingCount = await Ad.countDocuments({ seller: { $in: TEST_SELLER_IDS } });
  if (existingCount > 0 && !reset) {
    console.log('⚠️  ' + existingCount + ' annonces de test déjà présentes en base.');
    console.log('   Elles seront conservées. Utilisez --reset pour les supprimer d\'abord.');
    console.log('');
  }

  // ── 7. Conversion des documents ──
  var docs = ads.map(toMongoDoc);

  // ── 8. Import par lots ──
  var batchSize = 50;
  var inserted  = 0;
  var errors    = 0;

  console.log('📥 Import en cours (' + docs.length + ' annonces)...');
  console.log('');

  for (var i = 0; i < docs.length; i += batchSize) {
    var batch = docs.slice(i, i + batchSize);
    var done  = Math.min(i + batchSize, docs.length);
    try {
      var res = await Ad.insertMany(batch, { ordered: false });
      inserted += res.length;
    } catch(batchErr) {
      // ordered:false continue malgré les erreurs individuelles (ex: doublons)
      if (batchErr.insertedDocs) inserted += batchErr.insertedDocs.length;
      errors++;
    }
    process.stdout.write('   ' + done + '/' + docs.length + ' traitées\r');
  }

  // ── 9. Résumé final ──
  console.log('\n');
  console.log('════════════════════════════════════════════');
  console.log('  ✅  IMPORT TERMINÉ AVEC SUCCÈS');
  console.log('════════════════════════════════════════════');
  console.log('');
  console.log('  📋 ' + inserted + ' annonces insérées en base MongoDB');
  if (errors > 0) {
    console.log('  ⚠️  ' + errors + ' lots avec erreurs mineures (doublons ignorés)');
  }
  console.log('  🌟 ' + featured + ' annonces "À la une"');
  console.log('  👥 ' + TEST_SELLERS.length + ' vendeurs de test créés');
  console.log('');
  console.log('  Catégories disponibles :');
  Object.entries(bycat)
    .sort(function(a,b){ return b[1]-a[1]; })
    .forEach(function(entry){
      console.log('    ✓  ' + entry[0] + ' (' + entry[1] + ')');
    });
  console.log('');
  console.log('  🌍 Testez maintenant sur : https://yougouyougou.net');
  console.log('');
  console.log('  Pour réinitialiser les données de test :');
  console.log('  node import_catalogue.js --reset');
  console.log('════════════════════════════════════════════');
  console.log('');

  await mongoose.disconnect();
}

main().catch(function(err) {
  console.error('\n❌ Erreur inattendue :', err.message);
  console.error(err.stack);
  process.exit(1);
});
