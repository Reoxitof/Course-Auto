# 🏎️ Course Automobile — Chrono

Site de chronométrage de course automobile en temps réel.  
Optimisé mobile, avec gestion admin/spectateur, équipes, pénalités et DNF.

## Fonctionnalités

- **Admin** : démarrer/arrêter la course, enregistrer les tours, gérer pénalités et DNF
- **Spectateur** : visualisation en direct des temps et résultats
- Équipes avec couleurs personnalisées
- Temps au tour enregistré à l'appui du bouton
- Résultats en direct (par tour et global)
- Pénalités de temps modifiables + DNF
- Nombre de tours configurable
- Mots de passe générés aléatoirement (admin + spectateur)
- 100% client-side, aucune base de données requise (localStorage)

## Déploiement

### Docker / Sliplane

```bash
docker build -t course-auto .
docker run -p 80:80 course-auto
```

Sur **Sliplane** : connecter ce repo GitHub, Sliplane détecte le `Dockerfile` et déploie automatiquement.

### Local

Ouvrir `index.html` directement dans un navigateur.

## Stack

- HTML / CSS / JavaScript vanilla
- Nginx (pour le conteneur)
- Aucune dépendance npm
