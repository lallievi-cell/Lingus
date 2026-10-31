# La valle delle prime voci — direzione artistica

La revisione sceglie un’illustrazione naturalistica a tempera: salvia e verde bosco per la vegetazione, terra ocra, cuoio e terracotta, pietra chiara, luce calda e ombre fredde. La gerarchia visiva mette al centro persone, lavoro e accampamento; i dettagli del terreno accompagnano la lettura.

## Applicazione nel gioco

- **Terreno:** masse vegetali irregolari, radura asimmetrica in terra battuta, tracce d’uso del campo, prato a gruppi e palette distinte per i quattro biomi e le quattro stagioni. Il fiume segue la geografia effettiva.
- **Natura:** un atlante dipinto trasparente con sedici varianti per betulle, cespugli, germogli, selce, minerale, ceppi e vegetazione spoglia. Le sagome rimangono riconoscibili anche nella rappresentazione neutra precedente alla conoscenza dei materiali. In inverno gli alberi vivi sono spogli; i ceppi rappresentano gli alberi tagliati.
- **Persone:** dimensione visiva aumentata del cinquanta per cento, campiture più solide, incarnati e vesti modellati con luce e ombra, contorni attenuati. Bambini, neonati e anziani mantengono proporzioni e tratti distinti. Le aree selezionabili, le Scintille e gli indicatori seguono la nuova scala.
- **Animali:** cervi, lupi, predatori alfa e mammut conservano articolazione e comportamento, con volumi, mantello e dettagli più leggibili.
- **Costruzioni:** tutti i venti tipi ricevono materiali e volumi coerenti; la capanna usa pelli e pali, il falò mostra pietre, cenere e braci, i tetti hanno corsi di paglia leggibili e la muratura piani di luce distinti. Cantieri, danni, attività e stagioni restano visibili.
- **Vista regionale:** città composte con vicoli e piazzetta, pietra e tetti coerenti, maggiore contrasto per eserciti e carovane. Vocazioni, istituzioni, carichi e produzione restano legati allo stato reale.

Le scorte consegnate continuano a essere visibili e ispezionabili come documentato in [CAMP-STOCKS.md](CAMP-STOCKS.md).

## Immagini di verifica

Le seguenti scene usano il renderer reale. Gli edifici e le risorse delle gallerie sono preparati per la revisione artistica: non dimostrano una campagna o una progressione economica.

- [Accampamento e interfaccia sul telefono](images/valley-app-390.png).
- [Nuova partita con le sole parole iniziali](images/valley-first-steps-390.png): geografia e persone dello stato iniziale, senza risorse o edifici aggiunti.
- [Accampamento in primavera](images/valley-camp-1440.png).
- [Inverno sul telefono](images/valley-winter-390.png).
- [Tutti i venti edifici](images/valley-buildings.png).
- [Città, esercito e carovana](images/valley-region.png).

## Asset e rendering

`public/art/valley-natural-atlas.png` è un asset generato appositamente per Lingus con lo strumento di generazione immagini e revisionato per spaziatura, trasparenza e uso nel gioco. Non contiene interfaccia né sfondi. È distribuito insieme all’applicazione; il gioco non contatta servizi di generazione immagini.

`mapNaturalAtlas.ts` ritaglia le celle tramite metadati e trasparenza, conserva gli agganci al suolo e prepara le varianti cromatiche in una cache limitata a quarantotto ritagli. La vegetazione riceve una leggera oscillazione, ferma in pausa e disattivata dalla preferenza di movimento ridotto. Il caricamento è anticipato dalla pagina; se l’immagine non è disponibile, rimane il disegno procedurale di riserva. Le altre figure continuano a essere disegnate e animate sul Canvas, senza dipendere da immagini statiche per le azioni.

Il terreno viene preparato nella cache al cambio di geografia o stagione. Non vengono aggiunti nodi, materiali, edifici, collisioni o percorsi alla simulazione. La scala riguarda la presentazione: posizione, distanza di lavoro e calore rimangono quelli del motore. La revisione funziona con i salvataggi esistenti.

## Verifiche riproducibili

`tests/art-direction.spec.ts` esercita le quattro stagioni, la notte, desktop e telefono, il caricamento e l’effettivo uso dell’atlante, la selezione dei personaggi, l’immutabilità dello stato, gli edifici e la vista regionale. Include anche l’interfaccia completa sul telefono: una mappa a tutto schermo, da sola, non verifica la leggibilità nello spazio disponibile durante una partita.

`tests/visual-map.spec.ts` verifica le sagome selezionabili agli zoom elevati usando la scala corretta per persone e oggetti. `tests/motion-selection.spec.ts` cerca un pixel reale della testa durante l’interpolazione, seleziona la persona dove è disegnata e verifica le coordinate effettive restituite al motore. Le prove esistenti su gesti, ordini, posizionamento, risorse e scorte controllano le interazioni interessate dalla revisione. I test dell’atlante verificano trasparenza, ritaglio e disponibilità del disegno di riserva; quelli delle animazioni mantengono le pose legate al tempo del gioco.

La qualità artistica è stata valutata anche sulle schermate: la prima passata è stata corretta per eliminare macchie ovali ripetute e uniformare la saturazione della vegetazione e i contorni delle persone.

Verifica della revisione: suite del motore e dei componenti con **1.214 test superati**, build e formattazione valide. Dopo la verifica browser generale, le tredici prove dedicate a direzione artistica, sagome e selezione in movimento sono state ripetute con esito positivo sulla versione finale.
