# Guide de débogage - Affichage des images

## Problème : Les images ne s'affichent pas via /api/images/

### 1. Vérifications dans les logs Netlify

Après avoir uploadé une image, vérifiez les logs de la fonction Lambda sur Netlify :

**Logs attendus lors du STOCKAGE** :
```
[storeImage] Storing images/user_abc123_photo.jpg, size: 45678 bytes, type: image/jpeg
[storeImage] Successfully stored images/user_abc123_photo.jpg
```

**Logs attendus lors de la RÉCUPÉRATION** :
```
[getImage] Successfully retrieved images/user_abc123_photo.jpg, size: 45678 bytes, type: image/jpeg
```

**Logs d'erreur possibles** :
```
[storeImage] Blobs store not initialized
[getImage] Image not found: images/xxx.jpg
[getImage] Blobs error: ...
```

### 2. Vérifications dans la console du navigateur

Ouvrez les Developer Tools (F12) et allez dans l'onglet **Network** :

1. **Lors de l'upload d'une image** :
   - Cherchez une requête POST vers `/api/db` ou `/api/admin/users`
   - Vérifiez la réponse : elle devrait contenir `imageUrl: "/api/images/xxx.jpg"`

2. **Lors de l'affichage d'une image** :
   - Cherchez une requête GET vers `/api/images/xxx.jpg`
   - Status attendu : **200 OK**
   - Content-Type : **image/jpeg** ou **image/png**
   - Si **404** : L'image n'existe pas dans Netlify Blobs
   - Si **500** : Erreur serveur (voir les logs)

### 3. Test manuel d'upload

Pour tester si les images s'enregistrent correctement :

```javascript
// Dans la console du navigateur (après connexion)
const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

fetch('/api/images/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base64Data: testImage, id: 'test_123' })
})
.then(r => r.json())
.then(data => {
  console.log('Upload result:', data);
  // Tester la récupération
  return fetch(data.imageUrl);
})
.then(r => {
  console.log('Get result:', r.status, r.headers.get('content-type'));
});
```

### 4. Vérifier la configuration Netlify Blobs

Dans votre projet Netlify :

1. **Variables d'environnement** :
   - Vérifiez que `NETLIFY_SITE_ID` et `NETLIFY_AUTH_TOKEN` sont définis
   - Ces variables sont nécessaires pour Netlify Blobs

2. **netlify.toml** :
   ```toml
   [functions]
     external_node_modules = ["@netlify/blobs"]
   ```

3. **package.json** :
   ```json
   {
     "dependencies": {
       "@netlify/blobs": "^10.4.1"
     }
   }
   ```

### 5. Solutions aux problèmes courants

#### Problème : Images uploadées mais 404 lors de la récupération

**Cause** : Les images sont stockées avec un chemin différent de celui utilisé pour la récupération.

**Solution** : Vérifier dans les logs le chemin exact utilisé :
```
[storeImage] Storing images/xxx.jpg    <- Chemin de stockage
[getImage] Image not found: images/xxx.jpg  <- Chemin de récupération
```

#### Problème : 500 Internal Server Error

**Cause** : Netlify Blobs n'est pas correctement initialisé.

**Solution** : Vérifier que `connectLambda(event)` est appelé dans `netlify/functions/api.js` :
```javascript
module.exports.handler = async (event, context) => {
  try {
    const connectLambda = await getConnectLambda();
    if (typeof connectLambda === "function") {
      connectLambda(event);  // ← Important!
    }
  } catch (e) {
    // ...
  }
  return expressHandler(event, context);
};
```

#### Problème : Images affichées localement mais pas en production

**Cause** : En local, les images utilisent le filesystem. En production, Netlify Blobs.

**Solution** : Tester en mode "production" localement :
```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Lancer en mode dev Netlify
netlify dev
```

### 6. Redimensionnement des images

Toutes les images sont automatiquement redimensionnées à **max 500px de hauteur** avant d'être envoyées au serveur.

**Vérifier le redimensionnement** :
```javascript
// Dans la console, après avoir sélectionné une image
console.log('Image originale:', originalImage.size);
// Après redimensionnement
console.log('Image redimensionnée:', resizedBase64.length);
```

La taille devrait être **70-90% plus petite**.

### 7. Test complet d'un scénario

**Scénario** : Uploader une photo de profil

1. Se connecter
2. Aller dans "Compte"
3. Cliquer sur "Modifier photo"
4. Uploader une image
5. **Console** : Vérifier les logs
   ```
   [resizeImage] Original: 2000x1500px
   [resizeImage] Resized: 667x500px
   ```
6. **Network** : Vérifier la requête PUT vers `/api/user/me`
   - Réponse devrait contenir : `photoProfil: "/api/images/user_xxx_photo.jpg"`
7. **Network** : Vérifier la requête GET vers `/api/images/user_xxx_photo.jpg`
   - Status : 200
   - Content-Type : image/jpeg
8. L'image devrait s'afficher dans le profil

### 8. Commandes utiles pour le débogage

```bash
# Voir tous les blobs stockés (si vous avez accès au Netlify CLI)
netlify blobs:list

# Voir le contenu d'un blob
netlify blobs:get images/xxx.jpg

# Supprimer un blob de test
netlify blobs:delete images/test_123.png
```

### 9. Checklist de déploiement

Avant de déployer sur Netlify :

- [ ] `package.json` contient `@netlify/blobs`
- [ ] `netlify.toml` configure `external_node_modules`
- [ ] `netlify/functions/api.js` appelle `connectLambda(event)`
- [ ] Fonction `resizeImage()` est bien exportée dans `src/data/storage.js`
- [ ] Fonction `resizeImage()` est bien importée dans tous les fichiers qui uploadent des images
- [ ] Tests manuels en local avec `netlify dev`

### 10. Contact support

Si le problème persiste après avoir vérifié tout ce qui précède :

1. Collecter les informations suivantes :
   - Logs Netlify Functions (dernière erreur)
   - Console navigateur (erreurs JS)
   - Requête Network (status, headers, body)
   - Version de @netlify/blobs dans package.json

2. Créer un ticket sur le forum Netlify ou contacter le support avec ces informations.

## Résumé des fichiers modifiés

- ✅ `server/index.js` - Endpoints `/api/images/:filename` et gestion Blobs
- ✅ `src/data/storage.js` - Fonction `resizeImage()`
- ✅ `src/ui/QuestionCard.js` - Redimensionnement des photos de questions
- ✅ `src/routes/SignupPage.js` - Redimensionnement photo profil inscription
- ✅ `src/routes/MainPage.js` - Redimensionnement photo profil modification
- ✅ `src/ui/admin/AdminUsers.js` - Redimensionnement photo profil admin
