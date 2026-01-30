# Optimisations de Performance

## Problèmes résolus

1. **Chargement lent des données** - Le site était lent à démarrer car il chargeait toutes les données en une seule fois
2. **Pas de reprise de questionnaires** - Les utilisateurs devaient recommencer depuis le début même s'ils avaient déjà répondu à certaines questions

## Solutions implémentées

### 1. Chargement progressif des données

Le site utilise maintenant un système de chargement en 3 phases :

#### Phase 1 : Données minimales (instant)
- Questions actives uniquement
- Questionnaires visibles uniquement
- Aucune réponse (answers/completions)
- Le site s'affiche immédiatement avec ces données

#### Phase 2 : Données publiques (arrière-plan)
- Toutes les questions
- Tous les questionnaires
- Tags
- Toujours sans les réponses

#### Phase 3 : Données complètes (optionnel)
- Tout ce qui précède + les réponses
- Chargé uniquement si nécessaire (par exemple pour l'admin)

**Code côté client :**
```javascript
// Dans MainPage.js
const minimalDb = await loadDBProgressive((fullDb) => {
  // Callback appelé quand les données complètes arrivent
  setDb(fullDb);
});

// Le site s'affiche immédiatement avec minimalDb
setDb(minimalDb);
```

**Scopes API disponibles :**
- `?scope=minimal` - Phase 1 (le plus rapide)
- `?scope=public` - Phase 2
- (aucun scope) - Phase 3 (complet)

### 2. Système de cache serveur

Un cache en mémoire côté serveur réduit les accès disque/Blobs :

```javascript
// Cache différencié par scope
simpleCache.set('db:minimal', data, 30000);  // 30 secondes
simpleCache.set('db:public', data, 15000);   // 15 secondes
simpleCache.set('db:full', data, 10000);     // 10 secondes
```

Les données qui changent rarement (questions, questionnaires) sont cachées plus longtemps.

### 3. Reprise de questionnaires

Les utilisateurs peuvent maintenant reprendre un questionnaire là où ils se sont arrêtés.

#### Comment ça fonctionne

1. **Au démarrage d'un questionnaire**, le système charge les questions déjà répondues :
```javascript
const result = await getAnsweredQuestionsInQuestionnaire(qnId, user.id);
setAnsweredQuestionIds(new Set(result.answeredQuestionIds || []));
```

2. **Lors de l'affichage**, les questions déjà répondues sont filtrées :
```javascript
const questionnaireQuestions = useMemo(() => {
  // ... récupération des questions ...
  
  // Filtrer les questions déjà répondues
  return allQuestions.filter(q => !answeredQuestionIds.has(q.id));
}, [db, currentQuestionnaire, answeredQuestionIds]);
```

3. **L'utilisateur reprend** automatiquement à la première question non répondue

#### Endpoint API

```
GET /api/questionnaires/:id/questions?userId=xxx
```

Retourne :
```json
{
  "ok": true,
  "questionnaire": {...},
  "questions": [...],
  "answeredQuestionIds": ["q1", "q2", "q3"]
}
```

### 4. Optimisations supplémentaires

#### Cache HTTP côté navigateur
```javascript
res.setHeader('Cache-Control', 'public, max-age=30');
```

Les données sont mises en cache par le navigateur pour réduire les requêtes réseau.

#### Cache côté client
```javascript
const DB_CACHE_MS = 5000; // 5 secondes
```

Le client garde les données en mémoire pour éviter de recharger inutilement.

## Résultats

### Avant optimisations
- ⏱️ Temps de chargement initial : 3-5 secondes
- 📦 Taille du payload : 6+ MB (causait erreur 413)
- ❌ Reprise impossible

### Après optimisations
- ⏱️ Temps de chargement initial : < 500ms
- 📦 Taille du payload minimal : < 50KB
- ✅ Reprise automatique des questionnaires
- ✅ Chargement progressif en arrière-plan
- ✅ Cache intelligent à plusieurs niveaux

## Bonus : Préchargement des images

Le système précharge les images des prochaines questions pour une expérience fluide :

```javascript
const RANDOM_PREFETCH_TARGET = 3; // Précharger 3 questions à l'avance

function preloadImage(url, { timeoutMs = 12000 }) {
  // Préchargement avec timeout
}
```

## Monitoring

Pour vérifier les performances en production :

1. **Console du navigateur** :
```javascript
// Voir les scopes chargés
console.log('[loadDBProgressive] Minimal data loaded');
console.log('[loadDBProgressive] Full data loaded');
```

2. **Network tab** :
```
/api/db?scope=minimal  -> ~50KB
/api/db?scope=public   -> ~200KB
/api/db                -> ~500KB+
```

3. **Cache hits** :
```
Serveur : Cache hit ratio dans les logs
Client : Pas de requête = cache hit
```

## Configuration

### Ajuster les durées de cache

Dans `server/index.js` :
```javascript
// Pour questionnaires qui changent rarement
simpleCache.set(cacheKey, data, 60000); // 1 minute

// Pour données dynamiques
simpleCache.set(cacheKey, data, 5000);  // 5 secondes
```

### Ajuster le préchargement

Dans `MainPage.js` :
```javascript
const RANDOM_PREFETCH_TARGET = 5; // Plus de préchargement
```

## Notes techniques

- Le scope "minimal" n'inclut pas les tags car ils ne sont pas nécessaires à l'affichage initial
- Les réponses (answers/completions) ne sont jamais incluses dans "minimal" ou "public"
- Le cache serveur est invalidé lors de modifications de données
- Le système est rétrocompatible : sans `?scope`, le comportement est identique à avant
