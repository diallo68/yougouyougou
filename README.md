# YouGouYou — Guide de déploiement complet

Marketplace de petites annonces pour la Guinée.

## Structure du projet

```
yougouyougou/
├── server.js          ← Backend Node.js (API REST)
├── package.json       ← Dépendances
├── .env               ← Variables d'environnement (à créer)
├── .env.example       ← Modèle de configuration
└── public/
    └── index.html     ← Frontend complet
```

## Technologies utilisées
- **Frontend** : HTML/CSS/JS pur (Leaflet.js pour la carte)
- **Backend** : Node.js + Express
- **Base de données** : MongoDB Atlas (gratuit)
- **Hébergement** : Render.com (gratuit)
