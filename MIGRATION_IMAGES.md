# Migration du stockage des images

## Problème résolu

Le site rencontrait une erreur 413 "Exceeded maximum allowed payload size (6291556 bytes)" sur Netlify Functions.

### Cause
Les images étaient stockées en base64 directement dans les fichiers JSON (question.json et utilisateur.json), ce qui créait des payloads de plus de 6MB, dépassant la limite de Netlify Lambda.

## Solution implémentée

### 1. Suppression du dossier `data`
Le dossier `data` local a été supprimé car toutes les données passent maintenant par Netlify Blob Storage.

### 2. Système de stockage d'images séparé

Les images sont maintenant stockées comme fichiers séparés dans Netlify Blobs avec les clés :
- Questions : `images/q_{questionId}_img.{ext}`
- Utilisateurs : `images/user_{userId}_photo.{ext}`

Les fichiers JSON ne contiennent plus que les URLs d'accès aux images (ex: `/api/images/q_abc123_img.png`)

### 3. Nouveaux endpoints API

#### `/api/images/:filename` (GET)
Récupère une image stockée dans Netlify Blobs

#### `/api/images/upload` (POST)
Upload une nouvelle image
```json
{
  "base64Data": "data:image/png;base64,...",
  "id": "optional-custom-id"
}
```

#### `/api/admin/migrate-images` (POST)
Migre les images base64 existantes vers le stockage séparé

### 4. Conversion automatique

Tous les endpoints qui créent ou modifient des questions/utilisateurs détectent automatiquement les images base64 et les convertissent en fichiers séparés :

- `PUT /api/db` - Création/modification de questions
- `PUT /api/admin/users/:id` - Modification d'utilisateur
- `POST /api/user/sensible` - Réponse à une question avec tag variable.user (ex: photoProfil)

### 5. Page de migration

Une nouvelle section a été ajoutée à la page `/data` pour migrer les anciennes données :

**Fonctionnalités :**
- Bouton "Lancer la migration" pour convertir toutes les images base64 existantes
- Affichage du nombre d'images migrées par catégorie (questions, utilisateurs)
- Opération idempotente (peut être relancée sans problème)

## Utilisation

### Pour migrer les données existantes

1. Accédez à la page `/data` de votre site
2. Dans la section "Migration des Images", cliquez sur "Lancer la migration"
3. Attendez la fin de la migration
4. Rechargez la page principale

### Pour de nouvelles données

Les nouvelles questions et photos de profil utiliseront automatiquement le nouveau système. Aucune action nécessaire.

## Avantages

1. **Résout l'erreur 413** - Les payloads JSON sont maintenant < 100KB au lieu de >6MB
2. **Performance** - Les images sont servies avec cache HTTP (1 an)
3. **Scalabilité** - Pas de limite sur la taille des images individuelles
4. **Maintenabilité** - Séparation claire entre données structurées (JSON) et binaires (images)

## Notes techniques

- Les images sont stockées dans Netlify Blobs avec metadata (contentType)
- Fallback sur filesystem en mode développement local
- Les fonctions détectent automatiquement les chaînes base64 avec regex `/^data:image\/[a-zA-Z]+;base64,/`
- Support des formats : PNG, JPG, JPEG, GIF, WEBP
