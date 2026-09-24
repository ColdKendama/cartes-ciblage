# Cartes de ciblage

Une carte par client des villes ciblées dans Meta, avec leur rayon, et un
bouton IMPRIMER (lettre US, une page). Hébergée par GitHub Pages ; aucune
donnée dans ce dépôt.

**La source de vérité est l'onglet « Carte » du fichier de ciblage du
client** (Google Sheets), publié en CSV. On modifie le fichier ; la carte se
met à jour d'elle-même (Google peut prendre quelques minutes à republier).

## Ce qu'il y a ici

| Chemin | Rôle |
|---|---|
| `assets/carte.js`, `assets/carte.css` | La page, commune à tous les clients |
| `<client>/index.html` | Le nom du client et le lien CSV de son onglet « Carte » |
| `apps-script/Carte.gs` | Le script à coller dans le fichier de ciblage : crée l'onglet, remplit les coordonnées |

## L'onglet « Carte »

Une ligne par ville. Les en-têtes de la ligne 1 comptent, pas l'ordre des
colonnes (sauf Latitude, Longitude, Trouvé comme, qui restent ensemble).

| Campagne | Ville | Rayon (km) | Actif | Latitude | Longitude | Trouvé comme |
|---|---|---|---|---|---|---|
| Vente anniversaire 2026 | Alma, Quebec | 40 | ☑ | *auto* | *auto* | *auto* |

- **Campagne** s'affiche telle quelle au client. Plusieurs campagnes : des
  filtres apparaissent, une couleur par campagne.
- **Ville** au format de Meta (`Alma, Quebec`). La page affiche `Alma`.
- **Actif** décoché : la ville disparaît de la carte sans perdre la ligne.
- **Trouvé comme** : le lieu retenu par le géocodeur. Si ce n'est pas la
  bonne ville, taper les bonnes coordonnées à la main dans Latitude et
  Longitude : le script ne les écrase plus, sauf si on renomme la ville.

## Ajouter un client

1. Dans son fichier de ciblage : coller `apps-script/Carte.gs`, puis menu
   **Carte > Créer l'onglet Carte** et **Activer la mise à jour automatique**.
2. Publier l'onglet « Carte » en CSV (File > Share > Publish to web).
   **Seulement ce lien publié** (`/spreadsheets/d/e/2PACX-…`) va dans ce
   dépôt public, jamais le lien du classeur : partagé en « Editor », il
   laisserait n'importe qui modifier le ciblage.
3. Copier `gagnon-freres/` vers `<client>/`, changer `client` et `source`
   dans `index.html`.

## Essayer en local

```bash
python3 -m http.server 8765
```

Puis `http://localhost:8765/<client>/?source=<chemin ou lien CSV>` : le
paramètre `source` n'est lu qu'en local.
