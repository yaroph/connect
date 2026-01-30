# Nouveau système de stockage des images - CORRIGÉ

## ❌ Ancien problème

Les images n'étaient PAS stockées correctement, même si le code semblait fonctionner :
- Les JSON contenaient des routes `/api/images/xxx.jpg`
- MAIS ces images n'existaient pas réellement dans Netlify Blobs
- Quand on accédait à ces routes → 404 ou image vide

## ✅ Solution implémentée

### 1. Vérification après stockage

La fonction `storeImage()` vérifie maintenant que l'image est bien stockée :

```javascript
// Stocker l'image
await store.set(imageKey, buffer);

// NOUVEAU : Vérifier immédiatement que ça a fonctionné
const verification = await store.get(imageKey);
if (!verification) {
  throw new Error(`Image stored but verification failed`);
}
```

### 2. Fallback automatique vers filesystem

Si Netlify Blobs ne fonctionne pas, le système bascule automatiquement sur le filesystem :

```javascript
if (USE_BLOBS && !BLOBS_DISABLED) {
  try {
    // Essayer Netlify Blobs
    const store = await getBlobsStore();
    // ... stocker l'image ...
  } catch (e) {
    console.error('[storeImage] Blobs error, falling back to filesystem');
    BLOBS_DISABLED = true;  // Désactiver pour cette session
  }
}

// Si Blobs ne fonctionne pas, utiliser le filesystem
await fs.writeFile(imagePath, buffer);
```

### 3. Suppression des fallbacks silencieux

**AVANT** (problématique) :
```javascript
try {
  processedAnswer = await storeImage(processedAnswer, imageId);
} catch (e) {
  console.error('Failed to store photo:', e);
  // Garder le base64 en fallback  ← MAUVAIS !
}
```

**APRÈS** (correct) :
```javascript
// Si ça échoue, l'erreur remonte et l'utilisateur voit une erreur claire
processedAnswer = await storeImage(processedAnswer, imageId);
```

### 4. Logs améliorés

Tous les logs montrent maintenant clairement ce qui se passe :

```
[storeImage] Storing images/user_abc_photo.jpg, size: 45678 bytes
[storeImage] Successfully stored and verified images/user_abc_photo.jpg

[getImage] Successfully retrieved images/user_abc_photo.jpg from Blobs
```

Ou en cas de problème :
```
[storeImage] Blobs store not initialized - falling back to filesystem
[storeImage] Successfully stored /data/images/user_abc_photo.jpg (filesystem)

[getImage] Image not found in Blobs, trying filesystem
[getImage] Successfully retrieved /data/images/user_abc_photo.jpg from filesystem
```

## 🔍 Comment diagnostiquer les problèmes

### 1. Vérifier les logs Netlify Functions

Après avoir uploadé une image, vérifiez les logs :

**✅ Succès avec Blobs** :
```
[storeImage] Storing images/xxx.jpg, size: 45678 bytes
[storeImage] Successfully stored and verified images/xxx.jpg
```

**⚠️ Fallback sur filesystem** :
```
[storeImage] Blobs store not initialized - falling back to filesystem
[storeImage] Successfully stored /data/images/xxx.jpg (filesystem)
```

**❌ Échec complet** :
```
[storeImage] Blobs error: ...
[storeImage] Filesystem error: ...
Error: Failed to store image
```

### 2. Tester manuellement

Console du navigateur :
```javascript
// Upload une image de test
fetch('/api/images/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    base64Data: "data:image/png;base64,iVBORw0KG...",
    id: 'test_manual'
  })
}).then(r => r.json()).then(console.log);

// Vérifier qu'elle s'affiche
// Si ça retourne { ok: true, imageUrl: "/api/images/test_manual.png" }
// alors tester :
fetch('/api/images/test_manual.png')
  .then(r => console.log('Status:', r.status, 'Type:', r.headers.get('content-type')));
```

### 3. Vérifier la configuration Netlify

**Variables d'environnement requises** (automatiques sur Netlify) :
- `NETLIFY_SITE_ID` ou `SITE_ID`
- `NETLIFY_BLOBS_CONTEXT` (injecté automatiquement)
- `AWS_LAMBDA_FUNCTION_NAME` (présent sur Lambda)

**netlify.toml** :
```toml
[functions]
  external_node_modules = ["@netlify/blobs"]
  node_bundler = "esbuild"
```

**netlify/functions/api.js** doit appeler `connectLambda()` :
```javascript
const connectLambda = await getConnectLambda();
if (typeof connectLambda === "function") {
  connectLambda(event);  // ← IMPORTANT !
}
```

## 📋 Checklist de déploiement

Avant de déployer :

- [ ] `package.json` contient `"@netlify/blobs": "^10.4.1"`
- [ ] `netlify.toml` configure `external_node_modules`
- [ ] `netlify/functions/api.js` appelle `connectLambda(event)`
- [ ] Les images sont redimensionnées côté client (max 500px)
- [ ] Tester en local avec `netlify dev`
- [ ] Vérifier les logs après déploiement

## 🎯 Comportement attendu

### Scénario 1 : Netlify Blobs fonctionne (IDÉAL)

1. Utilisateur upload une photo
2. Photo redimensionnée côté client (< 300KB)
3. Envoyée au serveur en base64
4. `storeImage()` la stocke dans Netlify Blobs
5. Vérification immédiate que l'image existe
6. URL `/api/images/xxx.jpg` retournée
7. JSON sauvegardé avec cette URL (PAS de base64)
8. Quand on accède à `/api/images/xxx.jpg` → image s'affiche

**Logs** :
```
[storeImage] Storing images/xxx.jpg, size: 45678 bytes
[storeImage] Successfully stored and verified images/xxx.jpg
[getImage] Successfully retrieved images/xxx.jpg from Blobs
```

### Scénario 2 : Netlify Blobs ne fonctionne pas (FALLBACK)

1. Utilisateur upload une photo
2. Photo redimensionnée côté client
3. Envoyée au serveur en base64
4. `storeImage()` essaie Netlify Blobs → échec
5. Fallback automatique sur filesystem
6. Image stockée dans `/data/images/xxx.jpg`
7. URL `/api/images/xxx.jpg` retournée
8. JSON sauvegardé avec cette URL
9. Quand on accède à `/api/images/xxx.jpg` → `getImage()` cherche dans filesystem → image s'affiche

**Logs** :
```
[storeImage] Blobs error: Store not initialized
[storeImage] Falling back to filesystem
[storeImage] Successfully stored /data/images/xxx.jpg (filesystem)
[getImage] Image not found in Blobs, trying filesystem
[getImage] Successfully retrieved /data/images/xxx.jpg from filesystem
```

### Scénario 3 : Tout échoue (ERREUR)

1. Utilisateur upload une photo
2. `storeImage()` échoue (Blobs ET filesystem)
3. Erreur remonte à l'endpoint
4. L'utilisateur voit : **"Erreur lors de la sauvegarde de l'image"**
5. L'image n'est PAS sauvegardée (ni URL dans le JSON)

**Avantage** : Plus de fausses URLs qui pointent vers rien !

## 🔧 Si les images ne s'affichent toujours pas

### Problème : Les images étaient stockées AVANT la correction

**Symptôme** : Anciennes images ne s'affichent pas, nouvelles oui.

**Solution** : Migrer les anciennes données.

1. Aller sur `/data`
2. Cliquer sur "Lancer la migration" dans "Migration des Images"
3. Cela convertira toutes les images base64 en fichiers

### Problème : Netlify Blobs ne fonctionne pas du tout

**Symptôme** : Logs montrent toujours "falling back to filesystem".

**Causes possibles** :
1. Variables d'environnement manquantes
2. `@netlify/blobs` pas installé correctement
3. `connectLambda()` pas appelé
4. Problème de permissions Netlify

**Solution** :
1. Vérifier les variables d'environnement dans Netlify Dashboard
2. Redéployer avec `npm install --force`
3. Vérifier `netlify/functions/api.js`
4. Contacter le support Netlify si nécessaire

**Note** : Le filesystem fallback permet au site de fonctionner même si Blobs ne marche pas !

### Problème : Images fonctionnent en local mais pas en production

**Cause** : Configuration Netlify différente de l'environnement local.

**Solution** :
1. Tester avec `netlify dev` (pas `npm start`)
2. Vérifier que `USE_BLOBS` est true en production (voir logs)
3. Vérifier les variables d'environnement Netlify

## 📊 Résumé des changements

| Avant | Après |
|-------|-------|
| Erreurs silencieuses | Erreurs explicites |
| Fausses URLs dans JSON | URLs garanties valides |
| Pas de vérification | Vérification après stockage |
| Blobs ou rien | Blobs avec fallback filesystem |
| Logs peu clairs | Logs détaillés |
| Difficile à déboguer | Facile à diagnostiquer |

## ✅ Tests à faire après déploiement

1. **Test basique** :
   - Créer un compte avec une photo de profil
   - Vérifier que la photo s'affiche dans le profil
   - Vérifier les logs : `[storeImage] Successfully stored`

2. **Test question PHOTO** :
   - Répondre à une question de type PHOTO
   - Soumettre la réponse
   - Aller dans l'admin, vérifier que la photo s'affiche

3. **Test modification profil** :
   - Modifier sa photo de profil
   - Vérifier que la nouvelle photo s'affiche
   - Vérifier que l'ancienne est remplacée

4. **Test admin** :
   - En tant qu'admin, modifier la photo d'un utilisateur
   - Vérifier que ça fonctionne

Si TOUS ces tests passent → Le système fonctionne correctement ! 🎉
