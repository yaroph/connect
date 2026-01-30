# Correction complète - Enregistrement des images

## Problème identifié

Les images étaient **redimensionnées côté client** (donc converties en base64), envoyées au serveur, mais **pas converties en fichiers séparés** avant d'être sauvegardées. Résultat : les images base64 étaient stockées directement dans les JSON, causant :
- ❌ Erreur 413 (payload trop grand)
- ❌ Images non accessibles via `/api/images/`
- ❌ Performance dégradée

## Solution implémentée

Ajout de la **conversion automatique base64 → fichier** dans **TOUS** les endpoints qui reçoivent des images.

## Points d'entrée modifiés

### 1. **Inscription** (`POST /api/auth/register`)
**Ligne ~1182-1200**

```javascript
// AVANT (❌ problématique)
const user = normalizeUser({
  ...
  photoProfil: b.photoProfil || "",
  ...
});

// APRÈS (✅ corrigé)
let photoProfil = b.photoProfil || "";
if (photoProfil && isBase64Image(photoProfil)) {
  const imageId = `user_${Date.now()}_${Math.random().toString(16).slice(2)}_photo`;
  photoProfil = await storeImage(photoProfil, imageId);
  console.log('[register] Photo converted and stored:', photoProfil);
}

const user = normalizeUser({
  ...
  photoProfil: photoProfil,  // ← Maintenant une URL /api/images/xxx.jpg
  ...
});
```

### 2. **Modification de profil** (`PUT /api/user/me`)
**Ligne ~1300-1320**

```javascript
// AVANT (❌ problématique)
const u = normalizeUser({ ...users[idx], ...allowed });

// APRÈS (✅ corrigé)
// Convertir photoProfil si c'est du base64
if (allowed.photoProfil && isBase64Image(allowed.photoProfil)) {
  const imageId = `user_${users[idx].id}_photo`;
  allowed.photoProfil = await storeImage(allowed.photoProfil, imageId);
  console.log('[user/me] Photo converted and stored:', allowed.photoProfil);
}

const u = normalizeUser({ ...users[idx], ...allowed });
```

### 3. **Modification admin** (`PUT /api/admin/users/:id`)
**Ligne ~1374-1385**

✅ **Déjà corrigé dans version précédente**

```javascript
if (patch.photoProfil && isBase64Image(patch.photoProfil)) {
  const imageId = `user_${id}_photo`;
  patch.photoProfil = await storeImage(patch.photoProfil, imageId);
}
```

### 4. **Réponses aux questions** (`POST /api/answers/append`)
**Ligne ~1106-1128**

C'est ici que les **réponses aux questions de type PHOTO** sont enregistrées !

```javascript
// AVANT (❌ problématique)
const entry = {
  ...
  answer: answer ?? "",  // ← base64 directement
  ...
};

// APRÈS (✅ corrigé)
// Convertir answer si c'est une image base64 (questions de type PHOTO)
let processedAnswer = answer ?? "";
if (processedAnswer && isBase64Image(processedAnswer)) {
  const imageId = `answer_${userId}_${questionId}_${Date.now()}`;
  processedAnswer = await storeImage(processedAnswer, imageId);
  console.log('[answers/append] Photo converted and stored:', processedAnswer);
}

const entry = {
  ...
  answer: processedAnswer,  // ← URL /api/images/xxx.jpg
  ...
};
```

### 5. **Questions sensibles** (`POST /api/user/sensible`)
**Ligne ~1804-1815**

✅ **Déjà corrigé dans version précédente**

Pour les questions avec tag `variable.user.photoProfil` :
```javascript
if (field === 'photoProfil' && isBase64Image(processedAnswer)) {
  const imageId = `user_${u.id}_photo`;
  processedAnswer = await storeImage(processedAnswer, imageId);
}
```

### 6. **Création/modification de questions** (`writeAll()`)
**Ligne ~838-846**

✅ **Déjà corrigé dans version précédente**

Pour les images dans les questions (champ `imageUrl`) :
```javascript
if (processed.imageUrl && isBase64Image(processed.imageUrl)) {
  const imageId = `q_${question.id}_img`;
  processed.imageUrl = await storeImage(processed.imageUrl, imageId);
}
```

## Flux complet d'une image

### Exemple : Photo de profil lors de l'inscription

1. **Client (navigateur)**
   ```javascript
   // Utilisateur sélectionne une photo
   const file = event.target.files[0];
   
   // Conversion en base64
   const base64 = await fileToDataUrl(file);
   // → "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
   
   // Redimensionnement à 500px
   const resized = await resizeImage(base64, 500);
   // → "data:image/jpeg;base64,/9j/4AAQ..." (mais plus petit)
   
   // Envoi au serveur
   await authRegister({ photoProfil: resized });
   ```

2. **Serveur (Node.js)**
   ```javascript
   // Réception dans POST /api/auth/register
   let photoProfil = b.photoProfil;
   // → "data:image/jpeg;base64,/9j/4AAQ..."
   
   // Détection base64
   if (isBase64Image(photoProfil)) {
     // Conversion en fichier
     photoProfil = await storeImage(photoProfil, imageId);
     // → "/api/images/user_123_photo.jpg"
   }
   
   // Sauvegarde dans utilisateur.json
   const user = { photoProfil: photoProfil };  // URL, pas base64 !
   await writeUsers([...users, user]);
   ```

3. **Stockage (Netlify Blobs)**
   ```javascript
   // Dans storeImage()
   const buffer = Buffer.from(base64Content, 'base64');
   await store.set('images/user_123_photo.jpg', buffer);
   console.log('[storeImage] Successfully stored images/user_123_photo.jpg');
   ```

4. **Récupération (affichage)**
   ```javascript
   // Client demande l'image
   <img src="/api/images/user_123_photo.jpg" />
   
   // Serveur dans GET /api/images/:filename
   const blob = await store.get('images/user_123_photo.jpg');
   res.setHeader('Content-Type', 'image/jpeg');
   res.send(Buffer.from(blob));
   ```

## Vérification que ça fonctionne

### 1. Tester l'inscription avec photo

```bash
# Console du navigateur
1. Aller sur /signup
2. Remplir le formulaire
3. Uploader une photo
4. Ouvrir Network tab (F12)
5. Soumettre le formulaire

# Vérifier la requête POST /api/auth/register
# Body devrait contenir : photoProfil: "data:image/jpeg;base64,..."

# Vérifier la réponse
# Body devrait contenir : photoProfil: "/api/images/user_xxx_photo.jpg"
```

### 2. Vérifier l'image dans le profil

```bash
# Après inscription
1. Aller sur la page principale
2. Regarder la photo de profil
3. Network tab : doit montrer GET /api/images/user_xxx_photo.jpg
4. Status : 200 OK
5. Content-Type : image/jpeg
6. L'image doit s'afficher
```

### 3. Tester une question PHOTO

```bash
# Console du navigateur
1. Répondre à une question de type PHOTO
2. Uploader une photo
3. Network tab : POST /api/answers/append
4. Body devrait contenir : answer: "data:image/jpeg;base64,..."
5. Réponse : { ok: true }

# Vérifier dans l'admin
1. Aller sur /admin → Réponses
2. Chercher la question PHOTO
3. L'image doit s'afficher via /api/images/answer_xxx.jpg
```

### 4. Logs serveur attendus

Dans les logs Netlify Functions, vous devriez voir :

```
[register] Photo converted and stored: /api/images/user_123_photo.jpg
[storeImage] Storing images/user_123_photo.jpg, size: 45678 bytes, type: image/jpeg
[storeImage] Successfully stored images/user_123_photo.jpg

[getImage] Successfully retrieved images/user_123_photo.jpg, size: 45678 bytes, type: image/jpeg
```

### 5. Vérifier le fichier JSON

Les fichiers JSON ne doivent **JAMAIS** contenir de base64 :

```json
// utilisateur.json - ✅ CORRECT
{
  "id": "user_123",
  "photoProfil": "/api/images/user_123_photo.jpg"
}

// utilisateur.json - ❌ INCORRECT
{
  "id": "user_123",
  "photoProfil": "data:image/jpeg;base64,/9j/4AAQSkZJ..." // NON !
}

// reponses.json - ✅ CORRECT
{
  "answers": [
    {
      "questionId": "q_photo",
      "answer": "/api/images/answer_123_456.jpg"
    }
  ]
}
```

## Cas particuliers

### Images URL (pas base64)

Si l'utilisateur entre une URL d'image (ex: `https://example.com/photo.jpg`), elle n'est **pas** convertie :

```javascript
if (photoProfil && isBase64Image(photoProfil)) {
  // ← La condition est FALSE pour une URL
  // → L'URL est conservée telle quelle
}
```

### Migration des anciennes données

Les anciennes images en base64 dans les JSON peuvent être migrées via `/data` → "Lancer la migration".

⚠️ **Important** : La migration ne redimensionne pas les anciennes images, seulement les nouvelles.

## Checklist de déploiement

Avant de déployer :

- [x] Tous les endpoints convertissent les images base64
- [x] Fonction `isBase64Image()` est définie
- [x] Fonction `storeImage()` est définie
- [x] Logs ajoutés pour le débogage
- [x] Redimensionnement côté client activé
- [x] Tests manuels effectués

Après le déploiement :

- [ ] Tester l'inscription avec photo
- [ ] Tester la modification de profil
- [ ] Tester une question PHOTO
- [ ] Vérifier les logs Netlify Functions
- [ ] Vérifier que les images s'affichent
- [ ] Vérifier la taille des fichiers JSON (doivent être < 100KB)

## Résumé

**6 endpoints modifiés** pour convertir automatiquement les images base64 en fichiers séparés :

1. ✅ POST /api/auth/register
2. ✅ PUT /api/user/me
3. ✅ PUT /api/admin/users/:id
4. ✅ POST /api/answers/append ← **CRUCIAL pour questions PHOTO**
5. ✅ POST /api/user/sensible
6. ✅ writeAll() (dans PUT /api/db)

**Résultat** : Plus d'images base64 dans les JSON, tout est stocké dans Netlify Blobs et accessible via `/api/images/`.
