/* Carte de ciblage Meta.
   Lit l'onglet « Carte » du fichier de ciblage (publié en CSV) et dessine
   chaque ville avec son rayon. La page d'un client ne contient que sa
   configuration, dans window.CARTE : voir gagnon-freres/index.html. */
(function () {
  'use strict';

  const config = window.CARTE || {};
  const COULEURS = ['#0B5D7A', '#B4461B', '#6B3FA0', '#2F7D32', '#9A5B00', '#A3245C'];
  const INACTIF = new Set(['false', 'faux', 'non', 'no', '0']);

  const dateLongue = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' });
  const heureCourte = new Intl.DateTimeFormat('fr-CA', { timeStyle: 'short' });
  const tri = new Intl.Collator('fr-CA', { sensitivity: 'base', numeric: true });

  // --- Lecture du CSV ------------------------------------------------------

  function lireCsv(texte) {
    const lignes = [];
    let ligne = [];
    let champ = '';
    let entreGuillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (entreGuillemets) {
        if (c !== '"') champ += c;
        else if (texte[i + 1] === '"') { champ += '"'; i++; }
        else entreGuillemets = false;
      } else if (c === '"') entreGuillemets = true;
      else if (c === ',') { ligne.push(champ); champ = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ); lignes.push(ligne);
        ligne = []; champ = '';
      } else champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  const normaliser = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  // Le classeur est en locale française : « 48,4284 » aussi bien que « 48.4284 ».
  function nombre(s) {
    const n = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // Meta nomme les villes en anglais (« Alma, Quebec ») : on garde le nom seul.
  function nomAffiche(ville) {
    const nom = ville.split(',')[0].trim();
    return nom === 'Quebec' ? 'Québec' : nom;
  }

  function versVilles(lignes) {
    const iEntete = lignes.findIndex(l => l.some(c => normaliser(c) === 'ville'));
    if (iEntete < 0) throw new Error('Colonne « Ville » introuvable dans le CSV publié.');
    const entete = lignes[iEntete].map(normaliser);
    const col = debut => entete.findIndex(c => c.startsWith(debut));
    const c = {
      campagne: col('campagne'), ville: col('ville'), rayon: col('rayon'),
      actif: col('actif'), lat: col('latitude'), lng: col('longitude'),
    };
    return lignes.slice(iEntete + 1)
      .map(l => ({
        campagne: (l[c.campagne] || '').trim(),
        ville: (l[c.ville] || '').trim(),
        rayon: nombre(l[c.rayon]),
        actif: c.actif < 0 || !INACTIF.has(normaliser(l[c.actif])),
        lat: nombre(l[c.lat]),
        lng: nombre(l[c.lng]),
      }))
      .filter(v => v.ville && v.actif)
      .map(v => ({ ...v, nom: nomAffiche(v.ville) }));
  }

  // --- Page ----------------------------------------------------------------

  const ICONE_IMPRIMANTE = '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="currentColor" d="M7 3h10v4H7zM5 8h14a3 3 0 0 1 3 3v6h-4v4H6v-4H2v-6a3 3 0 0 1 3-3zm3 8v3h8v-3zm10-5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>';

  document.getElementById('app').innerHTML = `
    <header class="entete">
      <div class="entete-texte">
        <p class="surtitre">Ciblage géographique Meta</p>
        <h1 id="client"></h1>
        <p class="campagnes" id="campagnes"></p>
        <p class="resume" id="resume">Chargement des villes…</p>
      </div>
      <button type="button" class="imprimer ecran-seulement" id="imprimer" disabled>${ICONE_IMPRIMANTE}<span>Imprimer</span></button>
      <p class="date-impression impression-seulement" id="date-impression"></p>
    </header>
    <nav class="filtres ecran-seulement" id="filtres" aria-label="Campagnes" hidden></nav>
    <main class="mise-en-page">
      <div class="cadre-carte"><div id="carte" role="region" aria-label="Carte des villes ciblées"></div></div>
      <section class="liste" aria-labelledby="titre-liste">
        <h2 id="titre-liste">Villes ciblées</h2>
        <p class="erreur" id="erreur" hidden></p>
        <ol id="villes"></ol>
      </section>
    </main>
    <footer class="pied">
      <p>Chaque cercle montre la zone où les publicités Meta sont diffusées autour de la ville.
      Les limites sont approximatives : Meta mesure le rayon à partir de son propre point central.</p>
      <p class="source">
        <span class="ecran-seulement" id="lecture"></span>
        <span class="impression-seulement">Version à jour en ligne : <span id="adresse"></span></span>
        <span>Préparé par Cardigan</span>
      </p>
    </footer>
    <div class="preparation ecran-seulement" id="preparation" hidden><p>Préparation de l’impression…</p></div>`;

  const $ = id => document.getElementById(id);
  $('client').textContent = config.client || '';
  $('adresse').textContent = location.host + location.pathname;

  const carte = L.map('carte', { zoomSnap: 0.25, zoomDelta: 0.5 });
  carte.attributionControl.setPrefix(false);
  const tuiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  }).addTo(carte);
  carte.setView([48.2, -70.5], 6);
  const calque = L.featureGroup().addTo(carte);

  let villes = [];
  let campagnes = [];
  let filtre = null; // null = toutes les campagnes
  let visibles = [];

  const couleurDe = campagne => COULEURS[Math.max(0, campagnes.indexOf(campagne)) % COULEURS.length];
  const km = n => `${String(n).replace('.', ',')} km`;

  function resume(liste) {
    const n = liste.length;
    const rayons = liste.map(v => v.rayon).filter(r => r !== null);
    let texte = `${n} ${n > 1 ? 'villes ciblées' : 'ville ciblée'}`;
    if (rayons.length) {
      const min = Math.min(...rayons);
      const max = Math.max(...rayons);
      texte += min === max ? ` · rayon de ${km(min)}` : ` · rayon de ${String(min).replace('.', ',')} à ${km(max)}`;
    }
    return texte;
  }

  function dessinerFiltres() {
    const nav = $('filtres');
    nav.hidden = campagnes.length < 2;
    if (nav.hidden) return;
    nav.replaceChildren();
    [null, ...campagnes].forEach(campagne => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filtre';
      b.setAttribute('aria-pressed', String(filtre === campagne));
      if (campagne !== null) b.style.setProperty('--c', couleurDe(campagne));
      b.textContent = campagne === null ? 'Toutes les campagnes' : campagne;
      b.addEventListener('click', () => { filtre = campagne; dessiner(); });
      nav.append(b);
    });
  }

  function dessiner() {
    visibles = villes
      .filter(v => filtre === null || v.campagne === filtre)
      .sort((a, b) => tri.compare(a.nom, b.nom));

    const nomsCampagnes = filtre === null ? campagnes : [filtre];
    $('campagnes').textContent = nomsCampagnes.filter(Boolean).join(' · ');
    $('resume').textContent = resume(visibles);
    dessinerFiltres();

    calque.clearLayers();
    const ol = $('villes');
    ol.replaceChildren();

    visibles.forEach((v, i) => {
      const numero = i + 1;
      const couleur = couleurDe(v.campagne);
      const aPosition = v.lat !== null && v.lng !== null;

      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ville';
      b.style.setProperty('--c', couleur);
      b.innerHTML = '<span class="num"></span><span class="nom"></span><span class="rayon"></span>';
      b.querySelector('.num').textContent = numero;
      b.querySelector('.nom').textContent = v.nom;
      b.querySelector('.rayon').textContent = v.rayon === null ? 'rayon à préciser' : km(v.rayon);
      if (!aPosition) {
        b.disabled = true;
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = 'position à confirmer';
        b.querySelector('.nom').append(note);
      }
      li.append(b);
      ol.append(li);
      if (!aPosition) return;

      const etiquette = document.createElement('span');
      etiquette.textContent = v.rayon === null ? v.nom : `${v.nom} · ${km(v.rayon)}`;

      const pastille = L.marker([v.lat, v.lng], {
        icon: L.divIcon({ className: 'pastille', html: `<span style="--c:${couleur}">${numero}</span>`, iconSize: [24, 24] }),
        keyboard: false,
      }).bindTooltip(etiquette, { direction: 'top', offset: [0, -12] });
      calque.addLayer(pastille);

      let zone = pastille;
      if (v.rayon !== null) {
        zone = L.circle([v.lat, v.lng], {
          radius: v.rayon * 1000, color: couleur, weight: 2, opacity: 0.9,
          fillColor: couleur, fillOpacity: 0.13,
        });
        calque.addLayer(zone);
      }

      const allumer = actif => li.classList.toggle('actif', actif);
      [pastille, zone].forEach(couche => {
        couche.on('mouseover', () => allumer(true));
        couche.on('mouseout', () => allumer(false));
      });
      b.addEventListener('mouseenter', () => { allumer(true); pastille.openTooltip(); });
      b.addEventListener('mouseleave', () => { allumer(false); pastille.closeTooltip(); });
      b.addEventListener('click', () => {
        carte.fitBounds(zone.getBounds ? zone.getBounds() : L.latLngBounds([pastille.getLatLng()]), { maxZoom: 10, padding: [24, 24] });
        pastille.openTooltip();
      });
    });

    recadrer();
  }

  function recadrer() {
    const limites = calque.getBounds();
    if (limites.isValid()) carte.fitBounds(limites, { padding: [18, 18], animate: false });
  }

  // --- Impression ----------------------------------------------------------
  // La carte imprimée n'a pas la taille de la carte à l'écran : on la
  // redimensionne, on attend les tuiles, puis on ouvre la boîte d'impression.

  const attendre = ms => new Promise(r => setTimeout(r, ms));

  function tuilesChargees(delaiMax) {
    return new Promise(resoudre => {
      if (!tuiles.isLoading()) return resoudre();
      const fin = setTimeout(resoudre, delaiMax);
      tuiles.once('load', () => { clearTimeout(fin); resoudre(); });
    });
  }

  function modeImpression(actif) {
    document.body.classList.toggle('impression', actif);
    $('date-impression').textContent = `Imprimé le ${dateLongue.format(new Date())}`;
    carte.invalidateSize({ animate: false });
    recadrer();
  }

  $('imprimer').addEventListener('click', async () => {
    $('preparation').hidden = false;
    modeImpression(true);
    await attendre(80);
    await tuilesChargees(6000);
    await attendre(150);
    $('preparation').hidden = true;
    window.print();
  });

  // Ctrl+P ou Fichier > Imprimer passent aussi par ici, sans attendre les tuiles.
  window.addEventListener('beforeprint', () => {
    if (!document.body.classList.contains('impression')) modeImpression(true);
  });
  window.addEventListener('afterprint', () => {
    $('preparation').hidden = true;
    modeImpression(false);
  });

  // --- Chargement ----------------------------------------------------------

  async function charger() {
    // Sur l'ordinateur seulement (localhost), ?source= permet d'essayer un autre CSV.
    const essai = ['localhost', '127.0.0.1'].includes(location.hostname)
      ? new URLSearchParams(location.search).get('source') : null;
    const source = essai || config.source;
    try {
      if (!source || !/^(https?:|\.|\/)/.test(source)) throw new Error('Aucun lien CSV dans la configuration (window.CARTE.source).');
      const reponse = await fetch(source, { cache: 'no-store' });
      if (!reponse.ok) throw new Error(`Le fichier de ciblage a répondu ${reponse.status}.`);
      villes = versVilles(lireCsv(await reponse.text()));
      campagnes = [...new Set(villes.map(v => v.campagne))];
      $('lecture').textContent = `Liste à jour au ${dateLongue.format(new Date())}, ${heureCourte.format(new Date())}`;
      $('imprimer').disabled = false;
      dessiner();
    } catch (e) {
      console.error('[carte]', e);
      $('resume').textContent = '';
      const erreur = $('erreur');
      erreur.hidden = false;
      erreur.textContent = 'La liste des villes n’a pas pu être chargée. Rafraîchissez la page dans quelques minutes. Si le problème continue, écrivez à Cardigan.';
    }
  }

  charger();
})();
