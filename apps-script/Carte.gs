/**
 * Carte de ciblage : prépare et entretient l'onglet « Carte » du fichier de
 * ciblage d'un client. À coller dans Extensions > Apps Script du classeur.
 *
 * - « Créer l'onglet Carte » : copie les blocs « Ville | Rayon (km) » existants
 *   dans un tableau à plat, une ligne par ville (une seule fois).
 * - Les coordonnées (Latitude, Longitude) se remplissent avec le géocodeur de
 *   Google. « Trouvé comme » montre le lieu retenu : c'est là qu'on repère une
 *   ville mal placée. Des coordonnées tapées à la main ne sont jamais écrasées,
 *   sauf si on change le nom de la ville.
 * - « Activer la mise à jour automatique » : dès qu'on tape ou colle une ville,
 *   ses coordonnées apparaissent.
 */

const ONGLET = 'Carte';
const ENTETES = ['Campagne', 'Ville', 'Rayon (km)', 'Actif', 'Latitude', 'Longitude', 'Trouvé comme'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Carte')
    .addItem('Créer l’onglet Carte à partir du ciblage existant', 'creerOngletCarte')
    .addItem('Trouver les coordonnées manquantes', 'trouverCoordonneesManquantes')
    .addSeparator()
    .addItem('Activer la mise à jour automatique', 'activerMiseAJourAuto')
    .addToUi();
}

function creerOngletCarte() {
  const ui = SpreadsheetApp.getUi();
  const classeur = SpreadsheetApp.getActive();
  if (classeur.getSheetByName(ONGLET)) {
    ui.alert(`L’onglet « ${ONGLET} » existe déjà. Rien n’a été modifié.`);
    return;
  }

  const lignes = [];
  classeur.getSheets().forEach(feuille => {
    lireBlocs(feuille.getDataRange().getValues()).forEach(l => lignes.push(l));
  });
  if (!lignes.length) {
    ui.alert('Aucun bloc « Ville | Rayon (km) » trouvé. L’onglet n’a pas été créé.');
    return;
  }

  const carte = classeur.insertSheet(ONGLET);
  carte.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES]).setFontWeight('bold');
  carte.getRange(2, 1, lignes.length, ENTETES.length).setValues(lignes);
  carte.getRange(2, 4, lignes.length, 1).insertCheckboxes().check();
  // Le CSV publié reprend le format affiché : 6 décimales, sinon la ville se déplace.
  carte.getRange(2, 5, carte.getMaxRows() - 1, 2).setNumberFormat('0.000000');
  carte.setFrozenRows(1);
  carte.setColumnWidths(1, 1, 320);
  carte.setColumnWidths(2, 1, 240);
  carte.setColumnWidths(7, 1, 420);

  const trouvees = trouverCoordonneesManquantes(true);
  ui.alert(`${lignes.length} villes copiées dans « ${ONGLET} », ${trouvees} placées sur la carte.\n\n` +
    'Vérifiez la colonne « Trouvé comme » : chaque ligne doit nommer la bonne ville.\n' +
    `À partir de maintenant, c’est l’onglet « ${ONGLET} » qu’on modifie.`);
}

// Repère chaque cellule « Ville » suivie de « Rayon… » à droite. La campagne
// est la cellule juste au-dessus ; les villes sont les lignes en dessous,
// jusqu'au prochain en-tête « Ville » de la même colonne.
function lireBlocs(valeurs) {
  const sortie = [];
  const texte = v => String(v).trim();
  for (let r = 0; r < valeurs.length; r++) {
    for (let c = 0; c < valeurs[r].length - 1; c++) {
      if (texte(valeurs[r][c]) !== 'Ville' || !/^Rayon/i.test(texte(valeurs[r][c + 1]))) continue;
      const campagne = r > 0 ? texte(valeurs[r - 1][c]) : '';
      for (let d = r + 1; d < valeurs.length; d++) {
        const ville = texte(valeurs[d][c]);
        if (ville === 'Ville') break;
        if (!ville) continue;
        sortie.push([campagne, ville, valeurs[d][c + 1], true, '', '', '']);
      }
    }
  }
  return sortie;
}

// Renvoie le nombre de villes placées. `silencieux` : pas de message à la fin.
function trouverCoordonneesManquantes(silencieux) {
  const carte = SpreadsheetApp.getActive().getSheetByName(ONGLET);
  if (!carte) {
    SpreadsheetApp.getUi().alert(`Pas d’onglet « ${ONGLET} ». Utilisez d’abord « Créer l’onglet Carte ».`);
    return 0;
  }
  const col = colonnes(carte);
  const derniere = carte.getLastRow();
  if (derniere < 2) return 0;

  const villes = carte.getRange(2, col.ville, derniere - 1, 1).getValues();
  const coords = carte.getRange(2, col.lat, derniere - 1, 3).getValues();
  let placees = 0;
  let introuvables = 0;
  villes.forEach(([ville], i) => {
    if (!String(ville).trim()) return;
    if (coords[i][0] !== '' && coords[i][1] !== '') { placees++; return; }
    const lieu = geocoder(ville);
    coords[i] = lieu ? [lieu.lat, lieu.lng, lieu.nom] : ['', '', 'Introuvable : vérifiez l’orthographe'];
    lieu ? placees++ : introuvables++;
  });
  carte.getRange(2, col.lat, derniere - 1, 3).setValues(coords);

  if (silencieux !== true) {
    SpreadsheetApp.getUi().alert(introuvables
      ? `${placees} villes placées, ${introuvables} introuvable(s). Voir la colonne « Trouvé comme ».`
      : `${placees} villes placées sur la carte.`);
  }
  return placees;
}

function activerMiseAJourAuto() {
  const classeur = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'surModification')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('surModification').forSpreadsheet(classeur).onEdit().create();
  SpreadsheetApp.getUi().alert('C’est activé : les coordonnées d’une ville apparaissent dès qu’on la tape dans l’onglet « Carte ».');
}

// Déclencheur installé par activerMiseAJourAuto : ne réagit qu'aux
// modifications de la colonne Ville de l'onglet Carte (collage de plusieurs
// lignes compris).
function surModification(e) {
  const feuille = e.range.getSheet();
  if (feuille.getName() !== ONGLET) return;
  const col = colonnes(feuille);
  if (e.range.getColumn() > col.ville || e.range.getLastColumn() < col.ville) return;

  const premiere = Math.max(2, e.range.getRow());
  const derniere = e.range.getLastRow();
  if (derniere < premiere) return;
  const villes = feuille.getRange(premiere, col.ville, derniere - premiere + 1, 1).getValues();
  const coords = villes.map(([ville]) => {
    if (!String(ville).trim()) return ['', '', ''];
    const lieu = geocoder(ville);
    return lieu ? [lieu.lat, lieu.lng, lieu.nom] : ['', '', 'Introuvable : vérifiez l’orthographe'];
  });
  feuille.getRange(premiere, col.lat, coords.length, 3).setValues(coords);
}

function colonnes(feuille) {
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const trouver = nom => {
    const i = entetes.indexOf(nom);
    if (i < 0) throw new Error(`Colonne « ${nom} » introuvable à la ligne 1 de l’onglet « ${ONGLET} ».`);
    return i + 1;
  };
  const col = { ville: trouver('Ville'), lat: trouver('Latitude'), lng: trouver('Longitude'), trouve: trouver('Trouvé comme') };
  if (col.lng !== col.lat + 1 || col.trouve !== col.lat + 2) {
    throw new Error('Latitude, Longitude et Trouvé comme doivent rester côte à côte, dans cet ordre.');
  }
  return col;
}

// « Alma, Quebec » est le nom tel que Meta l'affiche ; on précise le pays.
function geocoder(ville) {
  const reponse = Maps.newGeocoder().setRegion('ca').setLanguage('fr').geocode(`${ville}, Canada`);
  if (reponse.status !== 'OK' || !reponse.results.length) return null;
  const r = reponse.results[0];
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, nom: r.formatted_address };
}
