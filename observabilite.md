# Observabilité & Supervision (Google Cloud)

## 1) Objectif
Mettre en place une observabilité simple et crédible sur l’infra GCP afin de :
- diagnostiquer rapidement un incident (logs + erreurs)
- suivre l’activité (métriques / dashboard)
- être notifié en cas de problème (alertes)
- corréler requêtes ↔ logs ↔ latence (traces)

**Périmètre :**
- Services exécutés sur **Cloud Run**
- Logs dans **Cloud Logging**
- Métriques dans **Cloud Monitoring**
- Alerting dans **Cloud Monitoring → Alerting**
- Traces dans **Cloud Trace**

---

## 2) Logs (Cloud Logging)

### 2.1 Convention de logs (tag)
Tous les logs applicatifs sont taggés avec un préfixe stable pour filtrer facilement.

Exemples :
- `[proxy] ...`
- `[snapshotWorker] ...`
- `[resetBoardWorker] ...`
- `[placePixel] ...`

**Pourquoi :** en soutenance on peut filtrer en quelques secondes par composant, et retrouver une exécution / erreur précise.

### 2.2 Où lire les logs
Console GCP → **Logging → Logs Explorer**

**Filtre Cloud Run (exemple) :**
- `resource.type="cloud_run_revision"`
- Filtre `service_name = <ton_service>`
- Filtre `location = europe-west1` (si besoin)

**Filtre par composant (exemple) :**
- `textPayload:"[proxy]"`

### 2.3 Logs d’erreur
Dans les blocs `catch`, un log erreur est émis :
- `console.error("[xxx] failed", { errMessage, stack, ... })`

**But :** alimenter **Error Reporting** et rendre les erreurs visibles dans un widget “Erreurs”.

---

## 3) Dashboard (Cloud Monitoring)

Console GCP → **Monitoring → Dashboards**

### 3.1 Widgets minimum

#### A) Trafic (Request Count)
- **Metric :** *Cloud Run Revision – Request Count*
- **Filtre :** `service_name = place-pixel-dev` (ou ton service)
- **Aggregation :** `Sum`
- **Intervalle minimal :** `1m` (recommandé)

Objectif : prouver que le service reçoit des requêtes.

#### B) Répartition par codes HTTP (2xx / 4xx / 5xx)
- **Metric :** *Cloud Run Revision – Request Count*
- **Filtre :** `service_name = ...`
- **Group by / “par” :** `response_code_class`

Optionnel :
- graphe dédié 5xx : ajouter un filtre `response_code_class = 5xx`

> ⚠️ Si tu vois “0 time series”, c’est souvent parce qu’il n’y a eu aucun trafic dans la fenêtre de temps choisie.

#### C) Panneau Logs (Logs Panel)
But : afficher directement les erreurs applicatives.

Exemple de requête :
- `resource.type="cloud_run_revision"`
- `textPayload:"[proxy]"`
- `(textPayload:"failed" OR severity>=ERROR)`

Tu peux faire un panneau par composant :
- proxy / snapshotWorker / resetBoardWorker / placePixel

#### D) Error Reporting Panel
But : voir les exceptions captées au niveau projet (même si le panneau est vide : ça prouve que tu sais où regarder).

---

## 4) Alerting (2–3 alertes simples)

Console GCP → **Monitoring → Alerting → Create policy**

### 4.1 Alerte 5xx (serveur en erreur)
- **Metric :** *Cloud Run Revision – Request Count*
- **Filtre :** `service_name = ...`
- **Filtre :** `response_code_class = 5xx`
- **Condition :** `Sum > 0` sur `5 minutes`  
  (ou “> 5/min” selon ton trafic)

Objectif : être notifié si le backend renvoie des erreurs serveur.

### 4.2 Alerte latence (p95)
- **Metric :** *Cloud Run Revision – Request Latency*
- **Filtre :** `service_name = ...`
- **Align / Aggregation :** `95th percentile (p95)`
- **Condition :** `p95 > 1s` pendant `5 minutes`

Objectif : détecter une dégradation de performance.

### 4.3 Notifications
Console → **Monitoring → Alerting → Edit notification channels**
- Channel : Email (suffisant pour soutenance)
- Associer le channel à la policy

---

## 5) Procédure de vérification (checklist)

### 5.1 Logs
- [ ] Je vois des logs `[proxy] start` quand je fais un appel
- [ ] Je vois des logs `failed` quand je provoque une erreur volontaire
- [ ] Les logs sont filtrables par `textPayload:"[proxy]"`

### 5.2 Dashboard
- [ ] Le widget “Request Count” bouge quand je fais des requêtes
- [ ] Le widget `response_code_class` montre 2xx/4xx/5xx si trafic
- [ ] Le Logs Panel affiche les erreurs

### 5.3 Alerting
- [ ] Une policy 5xx existe et a un channel email
- [ ] Une policy latence p95 existe

### 5.4 Traces
- [ ] Trace Explorer contient des traces du service
- [ ] Je peux ouvrir une trace et montrer la latence

---
