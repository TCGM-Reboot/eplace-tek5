# ePlace — Documentation Projet (fonctionnement & architecture)

## 1) Objectif
**ePlace** est une application collaborative de “pixel board” :  
des utilisateurs placent des pixels sur une grille partagée. L’état du board est stocké côté backend et synchronisé vers les clients.

**Fonctionnalités principales :**
- placer un pixel (x, y, couleur)
- lire l’état du board (par zones / chunks) + pagination
- rate limit par utilisateur
- actions admin (reset board, session start/pause, snapshot)
- snapshot PNG d’une zone de la map
- OAuth Discord (récupération access token)
- proxy d’entrée unique (Activity / Discord interactions)

---

## 2) Concepts clés

### 2.1 Chunking (découpage de la map)
La grille est découpée en **chunks** de taille fixe.

- `CHUNK_SIZE = 64`
- un pixel est défini par `(x, y)`
- son chunk est :
  - `cx = floor(x / CHUNK_SIZE)`
  - `cy = floor(y / CHUNK_SIZE)`
- position locale dans le chunk :
  - `lx = x mod CHUNK_SIZE`
  - `ly = y mod CHUNK_SIZE`

**Pourquoi :**
- éviter de stocker un “gros” tableau unique
- limiter les lectures/écritures à une petite zone
- permettre un streaming / viewport (charger seulement ce qui est visible)

---

## 3) Architecture logique (flux)

### 3.1 Entrée HTTP : `proxy`
Le backend expose un endpoint HTTP `proxy` qui reçoit :
- soit des **Discord Interactions** (signées)
- soit des appels “Activity” (non signés)

Le proxy :
1. vérifie signature Discord si présent (branche “signed”)
2. sinon traite la requête Activity
3. **contrôle admin** si l’event est dans `ADMIN_TYPES` (via Discord API + roles)
4. publie un événement standardisé vers Pub/Sub sur `EVENTS_TOPIC`